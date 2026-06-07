## Changes

### 1. `src/routes/_authenticated/outbound.tsx` — reorder + collapsible
- Reorder cards inside the main grid to: **Email → Reminder to owner → My recent requests → LinkedIn post** (LinkedIn post moves to the bottom of the page, below the recent-requests list).
- Wrap the LinkedIn post `Card` in a collapsible shell:
  - Add `const [liOpen, setLiOpen] = useState(false)` (collapsed by default).
  - Card header gets a chevron button that toggles `liOpen`; body (textarea, schedule, generated image, media dropzone, submit button) only renders when `liOpen` is `true`.
  - Lightweight implementation using the existing `Card` component — extend it with an optional `collapsible`/`open`/`onToggle` prop, or render a custom header+body in this one spot using the same panel styling (`rounded-lg border border-border bg-panel p-5`) so it visually matches.
- Keep all existing logic (state, handlers, submit flow, image gen, Kling, media drop) unchanged.

### 2. New route `src/routes/_authenticated/outbound.archive.tsx` — past LinkedIn posts
- URL: `/outbound/archive` (file-based route under `_authenticated`, so still gated by auth).
- Reuses `listOutbound` server fn already imported in `outbound.tsx`; filters client-side to `kind === "outbound_linkedin"` AND `status === "sent"` (i.e. posts that actually went out). Shows newest first.
- Each row shows: post text excerpt, sent timestamp, scheduled timestamp if any, thumbnail of any attached media when present in payload, and a link out to the LinkedIn post URL if the payload stores one (otherwise omit).
- Header: "LinkedIn archive" with a back link to `/outbound`.
- No edit/send/delete actions — read-only.

### 3. Cross-link
- On `outbound.tsx`, add a small "View archive" link in the LinkedIn post card header next to the collapse chevron, pointing to `/outbound/archive`.

## Out of scope
- No DB migration — archive reads from the existing `approvals` rows via the current `listOutbound` server fn.
- No change to posting/scheduling logic, LinkedIn API version, or carousel flow.
- No new components beyond the one route file; keep the collapsible inline rather than adding a generic component.
