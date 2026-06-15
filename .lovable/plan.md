Goal
----
Match the behavior of the two existing untitled sessions (code rendered in the preview pane) but strip ALL code/HTML out of the chat column so only prose remains.

Fix
---
Edit `src/routes/_authenticated/cowork.tsx`:

1. Extend `detectPreview` to also catch an unfenced full HTML document (`<!doctype html...>` or `<html ...>...</html>`) when no previewable fenced block exists, returning `{ lang: "html", code }`.

2. Add helper `stripPreviewBlocks(reply, detected)`:
   - Remove every fenced ```` ``` ```` block from the reply (any language).
   - If an unfenced HTML doc was detected, remove that slice too.
   - Collapse extra blank lines; trim. If nothing remains, return `"Updated preview →"`.

3. In `send`, `regenerate`, and `startLoop`: store `stripPreviewBlocks(reply, block)` as the assistant message in `messages`, while still saving the extracted code into `preview_content` / `preview_type` exactly as today.

4. Revert the `effectiveType` auto-detect added last turn in `src/components/PreviewPane.tsx` — detection now happens upstream so the preview can trust the stored `type`.

Files
-----
- src/routes/_authenticated/cowork.tsx
- src/components/PreviewPane.tsx