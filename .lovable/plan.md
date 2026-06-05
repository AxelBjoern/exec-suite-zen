## Goal

When a user types a message like "send a mail to me about X" or "post on LinkedIn about Y" in chat, the request should automatically appear as a **pending** row on `/outbound` (and in the owner's approvals queue), instead of only returning a "draft" link. For LinkedIn, a tagline + image should be generated and attached.

## Changes

### 1. `src/serverfns/ceo-chat.functions.ts` — auto-file on intent

Replace the "draft link" block (lines ~1130–1167) so that when `parseOutboundIntent` returns a complete intent (`email`, `reminder`, or `linkedin`), the chat handler:

1. Calls the existing server-fn logic directly (import the underlying logic — or replicate the `fileRequest` insert into `approvals` with `requester_id = userId`, `status = 'pending'`, `kind = 'outbound_email' | 'outbound_reminder' | 'outbound_linkedin'`, payload populated from the parsed intent).
2. For `linkedin`, before filing: call the existing tagline generator (`src/lib/tagline.functions.ts`) and the image route (`/api/generate-linkedin-image`) server-side to produce `imageBase64`, then store it on the payload.
3. Replies in chat with a confirmation that links to `/outbound` and shows the new request id (and image preview for LinkedIn), e.g.
   `📨 Filed as pending in Outbound (#abc123). [Review →](/outbound)`
4. If the user has `auto_send_email` / `auto_send_linkedin` ON, the existing `performSend` path runs automatically (hybrid: falls back to workspace Gmail).
5. If `intent.missing` is non-empty, keep the current "I still need: …" clarifying reply — nothing is filed.

Requires the chat handler to know the requesting user id. Add `requireSupabaseAuth` middleware (or read `userId` from the existing context) so the inserted row has a proper `requester_id`.

### 2. `src/lib/outbound.functions.ts` — expose a callable helper

Export an internal `fileOutboundFromChat({ userId, userEmail, intent })` helper that wraps the existing `fileRequest` so the chat handler can call it without duplicating the insert / auto-send branching.

### 3. LinkedIn image in the auto-file path

In the chat handler, when `intent.kind === "linkedin"`:
- Call `generateTagline(intent.text)` (already exists) for the headline overlay prompt.
- Call the image generator server-side (small wrapper around the existing `/api/generate-linkedin-image` logic — extract it into a server-only function so it can be invoked without an HTTP round-trip). Produce a single 1024×1024 PNG → base64.
- Attach `imageBase64` and `tagline` to the LinkedIn payload before filing.
- If image generation fails, still file the post without an image and note it in `payload.notes`.

### 4. `/outbound` page

No structural change needed — the existing personal-request list (`listMyRequests`) will pick up the new pending rows automatically. Confirm the list renders thumbnails when `payload.imageBase64 === "[image]"` (already stripped in list response); for the chat-filed rows we'll fetch the full row in the detail modal if needed. Add a brief "Just filed from chat" toast by reading `?filed=<id>` query param when the chat reply link includes it (optional polish).

### 5. Keep the manual draft path

The `/outbound?draft=<base64>` pre-fill flow stays intact for the case where users open the page directly. Only the chat behavior changes from "link" → "auto-file + link".

## Out of scope

- Editing the filed row from chat (user edits on `/outbound`).
- Multi-image LinkedIn posts.
- Notifying owner via email on new pending row.

## Files touched

- `src/serverfns/ceo-chat.functions.ts` (intent block rewrite + auth context)
- `src/lib/outbound.functions.ts` (new `fileOutboundFromChat` export)
- `src/lib/linkedinImage.server.ts` (new — extract image-gen so it's callable in-process)
- `src/routes/api/generate-linkedin-image.ts` (refactor to use the new server helper)
- `src/routes/_authenticated/outbound.tsx` (optional `?filed=` toast)
