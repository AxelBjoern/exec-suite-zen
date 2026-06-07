## What's actually failing

The failed approval in the DB confirms it: yes, **only the PDF carousel post is failing**. A text-only LinkedIn post in the same batch went through fine.

The failure note on `approvals.id = 09b8983a…`:

```
LinkedIn document init failed (426):
{"status":426,"code":"NONEXISTENT_VERSION","message":"Requested version 20250501 is not active"}
```

LinkedIn's versioned REST API (used for `documents` carousels and `rest/posts`) expects `LinkedIn-Version: YYYYMM` and only keeps roughly the last ~12 months active. The previous fix bumped the header from `202405` to `202505` — but as of June 2026, `202505` (May 2025) has aged out too.

This only affects the carousel/PDF code path in `src/lib/outbound.functions.ts` (and the scheduled-cron variant) — text-only posts use the legacy `/v2/ugcPosts` endpoint, which doesn't need `LinkedIn-Version`, which is why those keep succeeding.

## OpenRouter — not involved here

Per the project memory rule, all LLM calls go through OpenRouter via `src/server/llm.server.ts`. The outbound module imports `chatCompletion` from there for the "AI edit draft" feature only — it is not on the post-to-LinkedIn path. The carousel failure has nothing to do with OpenRouter; no change there is needed.

## Fix

1. In `src/lib/outbound.functions.ts`, change the `liVersion` constant inside `postLinkedInAsWorkspace` from `"202505"` to a currently active version: **`"202511"`** (Nov 2025, well within LinkedIn's supported window in mid-2026).
2. Mirror the same change in `src/routes/api/public/cron/scheduled-outbound.ts` so the cron worker uses the same header.
3. Retry the failed approval row from the Outbound page (the "Retry" button calls `approveOutbound` again, which re-runs the upload with the new header).

## Hardening (small, same change set)

- Add a clearer error wrapper when `documents init` returns `NONEXISTENT_VERSION`, suggesting the version needs bumping — so the next time this ages out (≈12 months) the message points straight at the fix instead of bubbling raw LinkedIn JSON.
- No DB migration, no new dependencies, no UI changes.

## Out of scope

- The Vite/SSR errors in older dev-server logs (`budget.tsx` code-splitter, `outbound.tsx` stray `}`) — those were transient and the current files compile clean; not re-touching them here.
- Changing the carousel upload pipeline itself (pdf-lib page count check, document URN flow) — it's correct, only the version header is stale.
