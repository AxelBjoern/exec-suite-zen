## Goal
Extend the Cowork preview pane (`src/components/PreviewPane.tsx`) with three new live preview modes plus a diff-during-loop view.

## 1. HTML preview
- Add `"html"` to the `PreviewType` union and to the parser's `PREVIEWABLE` set in `cowork.tsx`.
- Render in a sandboxed iframe via `srcDoc={content}` with `sandbox="allow-scripts"`. No network/parent access.
- Reuses existing Edit/Save/Diff/Regenerate toolbar.

## 2. Live React/TSX component preview
- Add a "Run" toggle on the preview header for `tsx`/`ts` types.
- Render inside a sandboxed iframe using esm.sh + Babel standalone. The iframe HTML is built client-side:
  - Loads `react`, `react-dom/client`, `@babel/standalone` from esm.sh.
  - Transpiles the user code with `Babel.transform(code, { presets: ["react", "typescript"] })`.
  - Expects the snippet to `export default` (or assign `App =`) a component. Falls back to rendering the last expression.
  - Catches runtime/transpile errors and shows them in-iframe (red panel).
- Same "Edit" mode still lets the user tweak before re-running.
- `sandbox="allow-scripts"` only — no DOM access to the parent.

## 3. Image preview
- Add `"image"` to `PreviewType`. The cowork parser additionally detects when the assistant reply contains a `data:image/...;base64,...` URL or an `https://...png|jpg|webp|gif|svg` URL on its own line (last one wins), and sets `preview_type = "image"` with the URL as content.
- Renders as `<img src={content}>` centered with object-contain.
- (No image generation wired up here — this only displays images the model emits as URLs/data URIs. A future change can hook up Lovable AI image generation as a tool.)

## 4. Auto-improve loop diff view
- Track the previous iteration's content in component state (`prevIterContent` in `cowork.tsx`).
- Add a new prop `iterationOriginal?: string` to `PreviewPane`. When set and different from `content`, the existing Diff dialog gets a second tab "Since previous iteration" alongside "Since last apply".
- During the loop, after each successful iteration we set `prevIterContent` to the value before the update and a small badge appears in the preview header: "Iter N — view changes" → opens the iteration diff.

## Files touched
- `src/components/PreviewPane.tsx` — add HTML iframe renderer, TSX runner iframe, image renderer, "Run" toggle for tsx, iteration-diff dialog tab, new `iterationOriginal` prop.
- `src/routes/_authenticated/cowork.tsx` — extend `PREVIEWABLE`/parser to recognize `html` fenced blocks and image URLs; track `prevIterContent` across loop iterations; pass it to `PreviewPane`.

No server, DB, or migration changes. No new dependencies (esm.sh + Babel are loaded at runtime inside the sandboxed iframe, not bundled).

## Security notes
- All executable previews (HTML + TSX) run in `<iframe sandbox="allow-scripts">` — no `allow-same-origin`, so they cannot read cookies, localStorage, or the parent DOM.
- Image preview only accepts `https://` and `data:image/` URLs; other schemes are rejected.
