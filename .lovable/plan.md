# Budget Wave B — Editor routes + components

Replace the 10 placeholder budget sub-routes with real editors ported from "Budget Dashboard Buddy", and add the supporting components.

## Components to add (`src/components/budget/`)
- `ScenarioMenu.tsx` — dropdown with create / duplicate / rename / delete / lock / set-base, wired to `useBudgetStore`. Mount inside existing `Topbar.tsx`.
- `KpiCard.tsx` — small KPI tile used across editors.
- `SectionHeader.tsx` — consistent section title + description.
- `BridgeCharts.tsx` — recharts EBITDA / revenue waterfall (client-only).
- `AssumptionsDrawer.tsx` — slide-over with per-year assumption editing, used by Assumptions + Monthly routes.

## Routes to implement (replace placeholders)
All under `_authenticated/budget.*`, all `ssr: false`, all read from `useActiveScenario()` + `compute(assumptions)`:

1. `budget.assumptions.tsx` — per-year tabbed editor: channels, pricing, salaries, streams, opening balance, financing. Writes via `store.updateAssumptions(scenarioId, draft)`.
2. `budget.monthly.tsx` — month-by-month table of `MonthlyRow` with sticky header, year switcher.
3. `budget.statements.tsx` — P&L / Cash Flow / Balance Sheet tabs from `engine.statements()`.
4. `budget.financing.tsx` — financing portfolio table + KPIs from `financing.ts`.
5. `budget.sensitivity.tsx` — tornado chart from `sensitivity.ts` (recharts horizontal bar).
6. `budget.scenarios.tsx` — full scenarios grid (vs. menu): clone, lock, set base, delete, rename inline.
7. `budget.compare.tsx` — pick N scenarios from `compareScenarios` UI state, side-by-side yearly KPIs + small multiples.
8. `budget.results.tsx` — executive summary: KPIs, BridgeCharts, revenue mix donut.
9. `budget.board.tsx` — print-friendly one-pager (used by Wave C exports).
10. `budget.changelog.tsx` — reads `auditLog` from UI state, shows recent mutations grouped by day.

## Wiring details
- Mount `<ScenarioMenu />` and a year switcher (already in Topbar shell) — replace Topbar's current static markup with the real component.
- All mutations go through `useBudgetStore` actions (already debounced → Supabase).
- Recharts/jspdf/pptxgenjs stay client-only; routes already opt out of SSR.
- No schema changes, no new secrets, no new deps (already added in Wave A).

## Out of scope (Wave C)
- Wiring Board → XLSX / PDF / PPTX export buttons.
- "Promote to VDNX baseline" server fn.
- Realtime sync on `budget_scenarios`.

## Build order in this turn
ScenarioMenu + Topbar wiring → KpiCard + SectionHeader (shared) → Assumptions + Monthly + Statements (core trio) → Financing + Sensitivity → Scenarios + Compare + Results → Board + Changelog. Each route is a focused port; placeholders are overwritten in place.
