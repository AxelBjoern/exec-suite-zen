## Goal

Two things, in order: (1) build a proper employee/salary editor in the Budget module, ported from the Energy system project; (2) seed the three VDNX scenarios exactly as the instruction document specifies.

Current state confirmed by reading the code: `YearAssumptions.salaries: SalaryRole[]` exists and the engine already computes `salaryCost` from it, but there is **no UI anywhere** to add or edit a salary row — the Assumptions tab has channels, pricing and overheads only. The Energy system project has a scenario-level `Employee[]` roster with raise timelines and a dedicated Salaries tab; that is the model to port.

---

## Phase 1 — Employee roster (do this first)

### Data model
Add to `src/lib/budget/types.ts`, mirroring Energy system:

```text
SalaryRaise { year, month (1-12), monthlySalary }
Employee    { id, name?, title, count, baseMonthlySalary,
              startYear?, startMonth?, endYear?, endMonth?, raises[] }
Assumptions.employees?: Employee[]   // scenario-level; supersedes per-year `salaries`
```

`YearAssumptions.salaries` stays for backwards compatibility with saved scenarios; the engine prefers `employees` when present.

### Engine
In `src/lib/budget/engine.ts`, add `employeeMonthlyCost(a, ya, year, month)`: for each active employee resolve the salary in force (base, then the latest raise whose year/month is on or before the current month), multiply by `count`, sum, then apply `(1 + socialFeesPct)`. When `a.employees` is defined it replaces the current `monthlySalaryCost` roster sum; otherwise the legacy path runs unchanged.

### Store
Add to `src/lib/budget/store.ts` (same autosave/lock pattern as `updateYear`):
`addEmployee(id, partial?)`, `updateEmployee(id, employeeId, patch)`, `removeEmployee(id, employeeId)`, `setEmployeeRaises(id, employeeId, raises)`. All no-op on locked scenarios and go through the existing debounced write to `budget_scenarios`.

### UI
New route `src/routes/_authenticated/budget.salaries.tsx` plus a "Salaries" nav entry in `src/components/budget/Topbar.tsx` (between Assumptions and Monthly). Components, each well under the 200-line cap:

- `src/components/budget/salaries/EmployeeList.tsx` — "Add employee" button, empty state, per-year engine salary total footer
- `src/components/budget/salaries/EmployeeRow.tsx` — draft state, dirty tracking, Save/Cancel, Remove with confirm
- `src/components/budget/salaries/EmployeeFields.tsx` — name, title, count, base monthly salary, start/end year+month, live "cost this year incl. social fees" readout
- `src/components/budget/salaries/RaisesTable.tsx` — add/remove scheduled raises (year, month, new monthly salary)

Semantic tokens only, Lucide icons, sonner toasts, shadcn primitives — no new packages.

### Sensitivity
`salaryCost` driver in `src/lib/budget/sensitivity.ts` scales `employees[].baseMonthlySalary` and every raise amount when the roster is present, falling back to the legacy `salaries` path otherwise.

---

## Phase 2 — Currency and labelling for VDNX

- Relabel every currency-suffixed field to **AED** (`CAC (SEK)` → `CAC (AED)`, etc.) and make `fmtSEK` in `src/lib/budget/format.ts` a currency-aware formatter defaulting to AED.
- Add `Scenario.currency?: string` and `Scenario.notes?: string` (notes render on the Board tab).
- No conversion logic. Any USD-derived figure carries the rate `USD 1 = AED 3.6725` in its comment.

---

## Phase 3 — Seed the three VDNX scenarios

Extend `src/lib/budget/seed.ts` with `VDNX_SCENARIOS`, exported alongside `SEED_ASSUMPTIONS`, and make them creatable from the Scenarios tab ("Seed VDNX scenarios" action that inserts them into `budget_scenarios` if absent).

All three: `startYear: 2026`, `years: 6`, `financing.enabled: false`, `vatRate: 0.05`, `taxRate: 0.09`, `opening.cash` and `opening.equity` = `3_672_500`.

| Scenario | Flag |
|---|---|
| VDNX — Base | `isBase: true` — Proof 2027 · Machine 2029 · Print 2031 |
| VDNX — Pilot Only | 1 Advisor Platform firm from 2027; 2029+ placeholder |
| VDNX — Upside | founding-partner cohort of 8 closes in 2026; volume only, prices unchanged |

Per-year fields follow the doc's mapping table verbatim: `startingCustomers: 5` in 2026 only, `salesStartMonth: 8` in 2026 / `1` after, `collaborations` as the dominant channel ramping to 160 ending client companies in 2027, `subscriptionPerCustomerYear: 3588` at the 2027 baseline, `extraServicesPerCustomerYear: 9000` in 2027. Churn, CAC, COGS %, invoicing, other external, social fees and every salary amount seed as `0` with `// PLACEHOLDER — needs input`. Each non-zero number carries an `ACTUAL` / `TARGET` / `MODEL` chip comment. 2028 and 2030 are interpolated at the stated ~2.3×/yr compounding and marked `MODEL`.

Salaries use the Phase 1 roster: from 2027, one `Employee` per round-funded hire, titles only where the deck names them, `baseMonthlySalary: 0` + placeholder comment.

Scenario notes carry the facts in section 5 unchanged (5 live entities, 4 jurisdictions, AED 20,000 related-party revenue recognised in 2026 outside the subscription line, USD 1M pre-seed, the five funded milestones, the capacity note as narrative only).

---

## Phase 4 — Board tab and guardrails

- Board tab renders the **Proof by 2027 · Machine by 2029 · Print by 2031** framing plus the scenario notes and chip legend.
- A chip renderer so `ACTUAL` / `TARGET` / `MODEL` / `PLACEHOLDER` are visible in the UI — MODEL figures are never presented as ACTUAL.
- Banned-word check across new labels and notes: bank-ready, compliance, guarantee, from scratch, regulator ready, audit ready.

---

## Phase 5 — Verification

1. Results tab 2027 total income within ±3% of **AED 2,014,080** (8 × 15,000 × 12 + 160 × 299 × 12).
2. Statements tab: no NaN, no blank rows, balance-sheet `check` is 0 every month.
3. Monthly tab: 2026 revenue starts in month 8.
4. Compare tab renders all three VDNX scenarios side by side.
5. Sensitivity resolves with churn/CAC at 0.
6. Salaries tab: add employee, schedule a raise, confirm the engine salary line moves in the month the raise takes effect.
7. Typecheck plus a preview pass over every budget tab.

## What this will not do

No fabricated churn, CAC, COGS, salary or 2028/2030 ARR figures. Financing module stays disabled. The price list is taken as canonical and not re-derived.
