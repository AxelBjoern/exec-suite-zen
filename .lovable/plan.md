# VDNX Loader — Canonical App-Wide Loader

Replace every loading indicator in the app with a single VDNX-branded loader component, adapted from the provided animation and themed to the gold/amber palette. This becomes THE loader for the entire app — no more bare `Loader2` spinners as loading states.

## New component

`src/components/VdnxLoader.tsx`:
- Props:
  - `label?: string` — defaults to context (e.g. "LOADING"); callers pass things like "THINKING", "SAVING", "GENERATING"
  - `size?: "xs" | "sm" | "md" | "lg"` — xs for button-internal, sm for inline status rows, md for panel-level, lg for full-screen/route fallbacks
  - `className?: string`
- Recreates the VDNX visual: stroked "VDNX" wordmark with pulse, neural dots, dashed neural connecting lines (inline SVG), animated gradient progress bar, tagline (the `label`)
- Size scale (wordmark / progress bar):
  - `xs` — 14px / 56px, no tagline, no neural lines (just wordmark + progress) — fits inside buttons
  - `sm` — 28px / 140px, compact stack — inline status rows
  - `md` — 64px / 240px — panel placeholders, dialog loading
  - `lg` — 102px / 300px — full-screen route suspense, initial app boot
- Colors mapped from blues to gold theme tokens:
  - text fill `#1e40af` → `var(--primary)`
  - text stroke `#1e3a8a` → `color-mix(in oklab, var(--primary) 70%, black)`
  - dots / lines / progress gradient `#3b82f6 #60a5fa #6366f1 #22d3ee` → `var(--gold)`, `var(--gold-muted)`, `var(--amber)`, `var(--primary)`
  - bg transparent (inherits parent — works in panels and overlays)
  - tagline uses `var(--muted-foreground)`
- Keyframes (`vdnx-logo-pulse`, `vdnx-neural-pulse`, `vdnx-dash`, `vdnx-progress`, `vdnx-gradient-shift`) added to `src/styles.css` with `vdnx-` prefix to avoid collisions

## Canonical full-screen wrapper

`VdnxScreen` exported from the same file — centered `lg` loader on a `bg-background` overlay. Used for route suspense fallbacks and full-page loading.

## App-wide replacement

Sweep the codebase and replace every loading UI with VdnxLoader at the appropriate size:
- `Loader2` icons used as standalone loading indicators (inline text rows, page placeholders, "loading…" blocks) → `<VdnxLoader size="sm" label="…" />` or `md`/`lg` as fits
- `Loader2` icons inside buttons (with `animate-spin`, sitting next to button label like "Saving…") → `<VdnxLoader size="xs" />` replacing the icon
- Route-level suspense / auth gate loading screens → `<VdnxScreen label="LOADING" />`
- Any custom skeleton "loading…" text blocks → swap to VdnxLoader

Specific call sites to update (non-exhaustive — actual sweep done at build time via `rg "Loader2"` and `rg "isLoading"`):
- `src/routes/_authenticated/cowork.tsx`:
  - Line 289 chat "thinking" inline → `<VdnxLoader size="sm" label={loopRunning ? "AUTO-IMPROVING" : "THINKING"} />`
  - Line 311 loop progress → `<VdnxLoader size="sm" label={\`ITER ${loopStep}/${loopIters}\`} />`
  - Apply button + Regenerate button spinners → `size="xs"`
- `src/components/PreviewPane.tsx`:
  - Mermaid "Rendering…" → `<VdnxLoader size="sm" label="RENDERING" />`
  - Button-internal spinners (Apply, Regenerate) → `size="xs"`
- `src/routes/_authenticated/route.tsx` auth gate loading → `<VdnxScreen label="LOADING" />`
- Any other components under `src/components/**` and `src/routes/**` rendering `Loader2` as a loading state

`Loader2` import is removed from files where it was only used as a loading indicator. Other lucide icons stay.

## Files

- new: `src/components/VdnxLoader.tsx` (exports `VdnxLoader`, `VdnxScreen`)
- edited: `src/styles.css` (add VDNX keyframes)
- edited: every file currently rendering `Loader2` as a loading state — full sweep, replacing with `VdnxLoader` at the appropriate size
