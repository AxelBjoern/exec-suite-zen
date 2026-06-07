## Changes

### 1. DB — add `archived_at` to `approvals`
- Migration: `ALTER TABLE public.approvals ADD COLUMN archived_at timestamptz` (nullable, NULL = not archived).
- No RLS changes needed (existing policies on `approvals` still apply).

### 2. `src/lib/outbound.functions.ts` — archive endpoints + filtered list
- `listMyRequests`: add `.is("archived_at", null)` so the live list excludes archived rows.
- New `setOutboundArchived` serverFn (POST, `requireSupabaseAuth`):
  - Input: `{ id: uuid, archived: boolean }`
  - Authorizes by `requester_id = userId`; sets `archived_at = now()` or `null`.
- Replace `listSentLinkedIn` with a broader `listArchivedOutbound` serverFn that returns ALL archived rows for the user (email, reminder, linkedin), newest archived first, kind included so the archive page can label them.

### 3. `src/routes/_authenticated/outbound.tsx` — reorder + collapsible list + archive buttons
- Reorder inside the main grid to: **My recent requests (collapsible, open by default) → Email → Reminder to owner → LinkedIn post**. LinkedIn keeps the collapsible behavior already in place.
- Wrap "My recent requests" `<section>` in a header with chevron toggle (`listOpen` state, default `true`); body only renders when open. Header also shows a small "Archive" link to `/outbound/archive`.
- Add an Archive icon button on each row (next to the existing delete button) that calls `setOutboundArchived({ id, archived: true })` and invalidates the recent-requests query. Disabled while busy. Available for all kinds and statuses.

### 4. `src/routes/_authenticated/outbound.archive.tsx` — generalize + unarchive
- Replace LinkedIn-only call with `listArchivedOutbound`.
- Render rows for all kinds with a small kind badge (email / reminder / linkedin) and a status badge.
- Each row gets an "Unarchive" button that calls `setOutboundArchived({ id, archived: false })`, then invalidates the archive query (and the outbound recent-requests query so it reappears there).
- Keep header link back to `/outbound`. Read-only otherwise (no edit/send/delete).

## Out of scope
- No change to posting/LinkedIn API logic.
- No bulk archive UI; just per-row buttons.
- Email/reminder rows in the archive show payload text only — no provider-side delete or re-send.
