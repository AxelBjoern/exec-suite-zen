# Parser Fallback Visibility + Review Queue

## 1. Tag fallback drafts (server)

`src/lib/outbound.functions.ts` → `filePlanFromChat`:

- When the two parse attempts return zero items and we file the raw text as a single LinkedIn draft, attach metadata to the draft `payload`:
  - `parser_fallback: true`
  - `fallback_reason: "parser_returned_no_items"`
  - `text_hash`: hex SHA-256 of the full input plan (via Web Crypto `crypto.subtle.digest`)
  - `text_length`, `text_preview` (first 240 chars)
  - `filed_from: "chat"`
- Insert one row into `public.audit_log`:
  - `actor: "system"`, `agent_slug: "outbound-parser"`, `action: "outbound.parser_fallback"`, `target: "<approval.id>"`
  - `payload: { text_hash, text_length, text_preview, attempts: 2, model: "x-ai/grok-4.3", requester_id: userId, created_at }`
  - `hash_self`: SHA-256 of the audit payload (consistent with existing rows).
- Extend the function's return shape with `parserFallback: boolean` and (when true) `fallbackId: string`, `textHash: string`.

No DB migration is needed — `approvals.payload` is jsonb and `audit_log` already has an open INSERT policy.

## 2. Chat-side UI notice

`src/components/chat/MessageRow.tsx` → `SendPlanButton.handleClick`:

- If `res.parserFallback === true`, replace the success toast with a `toast.warning` (sonner): "Parser couldn't structure your plan — filed as 1 LinkedIn draft for review." with an action button "Review fallbacks" linking to `/outbound?queue=fallbacks`.
- Otherwise behaviour is unchanged.

## 3. Outbound "Parser Fallbacks" queue

`src/routes/_authenticated/outbound.tsx`:

- Add a `queue` search param (`"main" | "fallbacks"`). A small segmented toggle near the top lets the user switch views. Initial value comes from the URL (`?queue=fallbacks` deep-link from the chat toast).
- A new `FallbacksQueue` component reuses the existing `my-outbound` query (no new server fn) and filters rows where:
  - `r.kind === "outbound_linkedin"`
  - `r.payload?.parser_fallback === true`
  - `r.archived_at == null`
- For each row: render existing `Card` plus a `Fallback` badge, the `text_hash` (short, 10 chars, monospace, `title` = full hash), and the `text_preview`.
- Bulk actions bar:
  - "Approve all" (owner only — uses `owner.data?.isOwner`): loops the selected/visible rows through `approveOutbound`.
  - "Archive all": loops through `setOutboundArchived({ id, archived: true })`.
  - Per-row checkbox lets the user limit the bulk action to selected rows; with nothing selected the action targets all visible fallback rows after a confirm.
- Single-row "Edit" reuses the existing `openEdit` modal — when saved, the row stays in the fallback queue until the user archives or it changes status.

## 4. Technical notes

- Hashing in the worker runtime uses `crypto.subtle.digest("SHA-256", new TextEncoder().encode(plan))`; convert to hex.
- The audit_log insert uses `supabaseAdmin` (loaded inside the handler) so it works regardless of RLS, and is wrapped in a `try/catch` so an audit failure never blocks the user-visible filing.
- `MessageRow` and `chat.tsx` already pass `res` through; the new `parserFallback` field is purely additive.
- No schema migration, no new tables, no new server functions — all changes live in `src/lib/outbound.functions.ts`, `src/components/chat/MessageRow.tsx`, and `src/routes/_authenticated/outbound.tsx`.

## Files touched

- `src/lib/outbound.functions.ts` — add fallback metadata + audit_log insert, extend return shape.
- `src/components/chat/MessageRow.tsx` — fallback toast with deep link.
- `src/routes/_authenticated/outbound.tsx` — queue toggle, FallbacksQueue view, bulk actions.
