## The bug

File reading in the chat has three concrete gaps, hitting both single and swarm:

1. **PPTX / XLSX / CSV / RTF fall through to `[Unsupported file type]`.** `uploadCeoAttachment` in `src/serverfns/ceo-chat.functions.ts` (lines 926–947) only handles txt/md, pdf, docx, and images. Anything else is stored with `extracted_text = "[Unsupported file type: …]"`, so the model literally sees that string.
2. **Swarm ignores images entirely.** `src/routes/api/public/swarm-stream.ts` (lines 164–185) only appends `extracted_text` into `augmentedContent`. Images have empty `extracted_text`, so every agent sees `[no extracted text available for this file]`. There is no image_url multimodal path like single chat has.
3. **The file picker `accept` string blocks pptx/xlsx/images.** `ACCEPTED_TYPES` in `src/lib/chat-helpers.ts` is `.pdf,.docx,.txt,.md`. Users can only get images in via paste; pptx/xlsx can't be attached at all from the picker.

## Fix

### 1. Extend extraction in `uploadCeoAttachment` (`src/serverfns/ceo-chat.functions.ts`)

Add branches before the `else` in the extraction block (~line 932):

- **.pptx** → dynamic `import("jszip")`, unzip, read every `ppt/slides/slide*.xml`, strip XML tags, join per-slide with `\n\n--- Slide N ---\n`. No new heavy dep — `jszip` is already transitively present; if not, add it (single small pure-JS package, edge-safe).
- **.xlsx** → dynamic `import("xlsx")` if available; otherwise same jszip route parsing `xl/sharedStrings.xml` + `xl/worksheets/sheet*.xml` into a plain-text table. Prefer `xlsx` when installed.
- **.csv / .tsv** → decode as utf-8 (same path as `.txt`).
- **.rtf** → decode utf-8 and strip `\{...}` control words with a simple regex.

Keep the 30k-char cap. Everything runs inside the handler, so no client-graph issue.

Verify jszip/xlsx availability first; add via `bun add` only if missing (constraint: no unneeded deps — jszip is tiny and standard).

### 2. Wire images into swarm (`src/routes/api/public/swarm-stream.ts`)

Mirror the single-chat pattern:

- Select `storage_path` too when loading attachments.
- Split rows into text vs `mime_type.startsWith("image/")`.
- For image rows, create a signed URL via `admin.storage.from("chat-uploads").createSignedUrl(path, 3600)` and collect `imageParts`.
- Pass `imageParts` down into `draftOne` and `synthesizeWithBreakdown`.

Update `src/server/swarm-core.server.ts` `draftOne` (and the synth call) so the user message becomes a multimodal array `[{type:"text",text},...imageParts]` when `imageParts.length > 0`, otherwise the current string. This is the same shape single chat already uses.

Filter out image-incapable models per-unit before dispatch when `imageParts.length > 0` (skip Hermes 4 405B, mark that draft as `skipped_no_vision` with a clear error). Do NOT hard-fail the whole swarm — degrade gracefully so vision-capable agents still answer.

### 3. Expand accepted upload types (`src/lib/chat-helpers.ts`)

Change `ACCEPTED_TYPES` to:
```
.pdf,.docx,.txt,.md,.csv,.tsv,.rtf,.pptx,.xlsx,image/*
```

No other UI changes; the composer already handles the file list generically.

## Non-goals / safety

- No schema changes.
- No new server functions, no changes to auth, swarm dispatch shape, quality-breakdown pipeline, or Auto/Swarm toggles.
- No touching `src/integrations/supabase/*`, `.functions.ts` server modules other than the two files above and `swarm-core.server.ts`.
- Extraction failures continue to store a `[Failed to extract text: …]` string so the model can still respond.

## Verify

After the edits:
- Upload a `.pptx` in single chat → agent quotes slide content.
- Upload the same `.pptx` in swarm → drafts reference it.
- Paste/attach a `.png` in swarm → vision-capable agents describe it, Hermes draft shows a clean "skipped (no vision)" error, run still completes.
- Existing `.pdf` / `.docx` / `.txt` flows unchanged.
