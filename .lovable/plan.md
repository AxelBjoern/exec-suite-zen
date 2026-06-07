## Honest diagnosis

You're right. The current Kling flow has two structural bugs that match your symptom of "no video shows up":

1. **The server function times out before Kling finishes.** `generateKlingClipForOutbound` blocks the request and polls OpenRouter for up to 4 minutes. The TanStack server runtime kills long-running fetches well before that — Kling typically finishes in 1–3 minutes, so the call returns an error (or just dies) before the MP4 is downloaded. The spinner stops, nothing lands in the DropZone, and no `mediaBase64` is ever persisted. That's why the Edit modal you keep reopening is empty.
2. **Even when it did finish, the round-trip is fragile.** Kling MP4 → base64 (~27 MB) → server-function response → back through `updateOutboundDraft` (~27 MB body again) sits right on the request-body size limit; partial failures here also produce an empty DropZone.

The narration / ElevenLabs path I added on top works in isolation but doesn't fix either of these.

## Plan — restructure to async job + storage

### Backend (`src/lib/outbound.functions.ts`)

Replace the single blocking `generateKlingClipForOutbound` with three short, fast server functions plus a Supabase Storage bucket:

1. **Storage bucket `outbound-media`** (private). One migration to create it.
2. **`startKlingJob`** `{ prompt, narration? }` → starts the OpenRouter Kling job. If `narration` is set, calls ElevenLabs in parallel, uploads the resulting MP3 to `outbound-media/<userId>/<jobId>.mp3`, returns `{ jobId, audioPath? }`. Fast (<10 s), well under any timeout.
3. **`pollKlingJob`** `{ jobId }` → polls OpenRouter once, returns one of:
   - `{ status: "processing" }`
   - `{ status: "completed", videoPath, videoUrl, audioPath?, audioUrl? }` — downloads the MP4, uploads it to `outbound-media/<userId>/<jobId>.mp4`, returns a signed URL.
   - `{ status: "failed", error }`
4. **Adjust `LinkedInReq` / `pickLiMedia` / `postLinkedInAsWorkspace`** to accept `mediaPath` (storage key) as an alternative to `mediaBase64`. When posting, the server downloads the bytes from Storage and feeds them into the existing LinkedIn upload pipeline (which already handles video assets).
5. **`updateOutboundDraft`** preserves `mediaPath` the same way it currently preserves `mediaBase64`. List queries return `mediaPath` directly (no base64 strip dance needed).
6. Delete the old `generateKlingClipForOutbound`. Keep narration support attached to step 2.

### Frontend (`src/routes/_authenticated/outbound.tsx`)

1. Replace the single `await genKling(...)` call (both on the main card and inside the Edit modal) with:
   - `await startKlingJob({ prompt, narration })` → keep `jobId` in state.
   - Poll `pollKlingJob({ jobId })` every 5 s, up to ~6 min, with a visible progress label: `Generating video… 1:23 / 6:00`.
   - On `completed`: set the DropZone state to `{ kind: "video", url: signedUrl, path: videoPath }` and play it inline with `<video controls>` (no base64 round-trip).
   - On `failed`: surface the OpenRouter error verbatim — no silent fallback.
2. Extend `editMedia` / `postMedia` state to carry `path` and `url`; DropZone renders `<video controls src={url}>` when present.
3. `saveEdit` writes `mediaPath` (not `mediaBase64`) into the payload.
4. Hydrate Edit modal from saved drafts: when `payload.mediaPath` is present, fetch a fresh signed URL on open and show `<video controls>` inline. This finally fixes the "Edit popup shows no controls" complaint.
5. Add a **Preview** button (Play / Image / FileText icon) on each row in "My recent requests" that opens a dialog with `<video controls>` (or image / pdf) from the signed URL. Disabled when the row has no `mediaPath`.

### Diagnostics first

Before I touch anything, when you next reach a build window I'll:
- Re-run a Kling generate from `/outbound` with the dev tools network tab open and pull `server-function-logs` for `generateKling` so the failure mode (timeout, 5xx, body too big, OpenRouter error) is captured in writing, not guessed.
- Confirm `OPENROUTER_API_KEY` and `ELEVENLABS_API_KEY` are present.

## Out of scope (ask if you want it)

- Persisting the ElevenLabs narration audio as part of the saved request (the plan above already uploads the MP3 to Storage during generation, so adding a row Play button for narration is small — flag if you want it included).
- Muxing narration into the MP4 (still needs ffmpeg; not possible in the Worker).

## Question

Confirm I should:
1. Add a `outbound-media` Supabase Storage bucket (private, signed URLs) and switch LinkedIn media persistence from base64-in-payload to storage paths, **or**
2. Reuse the existing `chat-uploads` bucket (the chat /video flow already writes there).

I'd default to (2) to avoid a migration, unless you'd rather keep outbound media physically separated from chat.
