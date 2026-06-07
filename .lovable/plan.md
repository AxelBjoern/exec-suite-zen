## Goal
On `/outbound`, in the "My recent requests" list, make each row (email, reminder, LinkedIn post) individually collapsible so the user can expand/collapse them one by one. The section-level collapse stays as-is.

## Changes

**`src/routes/_authenticated/outbound.tsx`**
- Track per-row open state with a `Record<string, boolean>` keyed by request id (default: collapsed).
- Refactor each row into a header bar + collapsible body:
  - **Header (always visible):** chevron toggle, kind badge, status badge, short summary (subject for email, title/preview for reminder, first ~80 chars of post text for LinkedIn), created-at, and the existing action buttons (Archive, Delete, etc.).
  - **Body (only when open):** full payload details currently rendered inline — email body, reminder full description, LinkedIn full post text + any media/preview.
- Clicking the header chevron (or header area) toggles that single row. Action buttons stop propagation so they don't toggle.
- No backend/data changes. No changes to archive page (out of scope unless requested).

## Out of scope
- Form section ordering and the section-level "My recent requests" collapse (already in place).
- Archive page row collapsing.
- Any posting/business logic.
