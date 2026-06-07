
# Continue: Budget module port + LinkedIn PDF carousel failure fix

This adds two work items to the existing in-flight plan: (A) continue the Budget Dashboard Buddy port, and (B) fix the failed LinkedIn carousel post visible in the outbound queue.

---

## A. Budget — continue porting from "Budget Dashboard Buddy"

Current state: `/budget` is a Supabase-backed scenario list shell only. The Buddy project has the full editor (engine, 11 routes, 6 components, board exports). Port it, swapping the Buddy's zustand+localStorage persistence for the host's `public.budget_scenarios` table (`assumptions jsonb`, `actuals jsonb`, `is_base`, `is_locked`, `is_system`, `owner_id`).

### Wave A — Engine + Supabase-backed store
1. Add deps: `xlsx`, `jspdf`, `jspdf-autotable`, `pptxgenjs`, `zustand`.
2. Copy verbatim into `src/lib/budget/`: `types.ts`, `seed.ts`, `format.ts`, `financing.ts`, `engine.ts`, `sensitivity.ts`, `exports.ts` (~2 000 LOC, pure functions, no DB coupling).
3. Write `src/lib/budget/store.ts` (new Supabase-backed zustand store):
   - Hydrate scenarios from `select * from budget_scenarios` (RLS already returns owner + system).
   - Mutations update the in-memory copy synchronously, then debounce 600 ms and `update budget_scenarios set assumptions=…, actuals=…, updated_at=now() where id=…`.
   - `addScenario / duplicate / rename / delete / toggleLock / setBaseScenario` call matching Supabase mutations and refresh.
   - `is_system` rows are read-only; `lockedScenarioIds = is_system || is_locked`.
   - UI-only state (`activeScenarioId, selectedYear, density, compareScenarios, auditLog`) persisted under `localStorage["budget-ui-v1"]`.
   - Rows missing `assumptions` get auto-seeded with `SEED_ASSUMPTIONS` on first read (write-through on next mutation).
4. Convert `src/routes/_authenticated/budget.tsx` → layout with `<Topbar />` + `<Outlet />`. Move the "create board" + scenario list into the Topbar's `ScenarioMenu`.
5. New default child route `budget.index.tsx` — lightweight KPI overview.

### Wave B — Routes & components
Copy components verbatim into `src/components/budget/`: `Topbar, ScenarioMenu, KpiCard, SectionHeader, BridgeCharts, AssumptionsDrawer`. Rewrite Topbar nav links to host routes.

Port these routes (flat dot-naming):

| Buddy `_app/*` | Host `_authenticated/budget.*` |
| --- | --- |
| `board.tsx` | `budget.board.tsx` |
| `budget.tsx` (assumptions editor) | `budget.assumptions.tsx` |
| `monthly.tsx` | `budget.monthly.tsx` |
| `scenarios.tsx` | `budget.scenarios.tsx` |
| `statements.tsx` | `budget.statements.tsx` |
| `financing.tsx` | `budget.financing.tsx` |
| `sensitivity.tsx` | `budget.sensitivity.tsx` |
| `compare.tsx` | `budget.compare.tsx` |
| `results.tsx` | `budget.results.tsx` |
| `changelog.tsx` | `budget.changelog.tsx` |

All budget routes use `ssr: false` (engine + recharts are client-only).

### Wave C — Exports + polish
1. Wire XLSX / PDF / PPTX exports in `budget.board.tsx` using ported `exports.ts` (fully client-side).
2. Owner-only "Promote to VDNX baseline" → new `setSystemScenario` server fn that flips `is_system=true, owner_id=null` (gated by existing `is_owner` RPC; RLS blocks end users from doing this directly).
3. Supabase Realtime on `budget_scenarios` filtered by `owner_id` for multi-tab sync. Requires migration: `alter publication supabase_realtime add table public.budget_scenarios;`.

### Out of scope (deferred)
- Persisted audit log, traceability popovers, print stylesheet, cross-user sharing.

---

## B. Fix failed LinkedIn carousel post

Failed approval in the queue:

```
LinkedIn registerUpload failed (403):
{"status":403,"serviceErrorCode":100,"code":"ACCESS_DENIED",
 "message":"Field Value validation failed in REQUEST_BODY:
  Data Processing Exception while processing fields
  [/registerUploadRequest/recipes/relationshipType]"}
```

### Root cause

`postLinkedInAsWorkspace` (in `src/lib/outbound.functions.ts`) and the cron mirror in `scheduled-outbound.ts` send **all media kinds**, including PDF documents, through the legacy `POST /v2/assets?action=registerUpload` endpoint with the recipe `urn:li:digitalmediaRecipe:feedshare-document`.

That recipe is **not valid for `/v2/assets`**. LinkedIn rejects unknown recipe values with the cryptic `Data Processing Exception while processing fields [/registerUploadRequest/recipes/...]` error — what looks like a `relationshipType` problem is actually LinkedIn's recipe-validator complaining via a shared field path.

Document carousels live on a separate API (`/rest/documents` + `/rest/posts` with `LinkedIn-Version` header). Images and videos correctly stay on the v2 assets path.

### Fix

In **both** `src/lib/outbound.functions.ts` (`postLinkedInAsWorkspace`) and `src/routes/api/public/cron/scheduled-outbound.ts` (`postLinkedIn`):

1. Branch on `media.kind`. Keep `image` and `video` on the existing v2 assets / `ugcPosts` path.
2. For `pdf`:
   - `POST /rest/documents?action=initializeUpload` with body
     `{ initializeUploadRequest: { owner: author } }` and headers
     `LinkedIn-Version: 202405`, `X-Restli-Protocol-Version: 2.0.0`.
   - `PUT` the PDF bytes (`Content-Type: application/pdf`) to the returned `uploadUrl`.
   - `POST /rest/posts` (NOT `/v2/ugcPosts`) with:
     ```json
     {
       "author": "<author>",
       "commentary": "<text>",
       "visibility": "PUBLIC",
       "distribution": { "feedDistribution": "MAIN_FEED" },
       "content": { "media": { "id": "<documentUrn>", "title": "<filename>" } },
       "lifecycleState": "PUBLISHED"
     }
     ```
     plus the same `LinkedIn-Version` / `X-Restli-Protocol-Version` headers.
3. Keep the existing client-side ≤ 10 MB + server-side `pdf-lib` ≤ 10-page guard.
4. Surface clearer error: if a registerUpload 403 comes back for an image/video path, prepend the recipe + endpoint to the error so the next failure is one-step debuggable.

### Retroactively recover the failed approval
After the fix is deployed, the existing failed row stays as-is (audit). The `Retry` button already in the queue UI re-runs the sender with the corrected code path, so the user can simply click `Retry` on that post.

### Files touched
- `src/lib/outbound.functions.ts` — split `postLinkedInAsWorkspace` media branch into image/video (v2 assets) vs pdf (rest documents + rest posts).
- `src/routes/api/public/cron/scheduled-outbound.ts` — mirror the same split.
- No schema, no new env, no new dep.

---

## Build order

1. **B first** (small, unblocks already-queued posts) — one focused turn.
2. Budget **Wave A** end-to-end (engine + store + layout + index + scenario menu — useful even before the other tabs land).
3. Budget **Wave B** (the editor routes + components).
4. Budget **Wave C** (exports + promote-to-VDNX + realtime).

Confirm and I'll start with B, then move into Budget Wave A.
