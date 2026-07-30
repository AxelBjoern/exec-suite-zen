## Goal

Remove all energy-industry concepts from the Budget module and leave a generic per-customer subscription business model. Existing saved scenarios are migrated silently on load.

## What gets removed

- kWh volume: `kwhPerCustomerYear`, `pricePerKwh`, `costPerKwh`
- Electricity certificates: `certificateCostPerKwh`, certificate income/cost lines
- Swedish price areas: `PriceAreaKey` (SE1–SE4), `AreaPricing` (öre fields), `priceAreaShare`, `priceAreaPricing`, `useAreaPricing`, and all `volumeByArea` / `revenueByArea` / `cogsByArea` aggregates
- Product streams: solar, battery, VPP, Energy SaaS (`StreamKey`, `STREAMS`, `StreamAssumptions`, stream income/cost/breakdown)
- `fmtOre` / `fmtSekPerKwh` formatters

## What stays

- Customers: starting customers, new customers by channel, churn, CAC, sales start month
- Revenue: subscription per customer/year, extra services per customer/year, plus a new generic **COGS % of revenue** so gross margin still works
- Costs: invoicing per customer, salaries + social fees, other external expenses, loan interest
- Financing module, statements (P&L / cash flow / balance sheet), sensitivity, scenarios, compare, board, exports

## Model after the change

```text
Revenue  = customers x (subscription + extra services) / 12   (+ surcharge %)
COGS     = revenue x cogsPct
Gross    = revenue - COGS
Opex     = invoicing + sales/CAC + salaries + other external
EBITDA   = gross - opex
```

## Technical changes

- `src/lib/budget/types.ts` — drop energy types/fields from `YearAssumptions`, `MonthlyRow`, `YearlyRow`; add `cogsPct`. Update header comment.
- `src/lib/budget/engine.ts` — remove area-pricing branch, kWh math, certificate lines, stream accumulation loop; compute revenue and COGS from the generic formula. Statements builder simplified accordingly.
- `src/lib/budget/seed.ts` — new blank-scenario shape (no streams, no area pricing).
- `src/lib/budget/store.ts` — add a `migrateAssumptions()` pass applied when scenarios load from `budget_scenarios` and from local state: strips unknown energy keys, fills `cogsPct` (default 0), leaves everything else intact. Saved rows are rewritten in the new shape on next autosave.
- `src/lib/budget/sensitivity.ts` — remove `kwhPerCustomer`, `streamSolar`, `streamBattery`, `streamVPP` drivers; keep price/churn/CAC/subscription drivers and add COGS %.
- `src/lib/budget/exports.ts` — replace "Cost of goods" energy sum and "Stream rev/cost" columns with the generic COGS column.
- `src/lib/budget/format.ts` — remove öre / SEK-per-kWh helpers.
- `src/routes/_authenticated/budget.assumptions.tsx` — remove kWh, price, cost, cert fields; add COGS %.
- `src/routes/_authenticated/budget.monthly.tsx`, `budget.results.tsx`, `budget.index.tsx`, `budget.board.tsx`, `budget.compare.tsx`, `budget.statements.tsx` — update any references to removed row fields.

No database migration is needed: assumptions live as JSON in `budget_scenarios.assumptions`, and the read-side migration handles legacy rows.

## Verification

Typecheck plus a preview pass over each budget tab (assumptions, monthly, results, statements, sensitivity, compare, board, financing) to confirm no NaN or blank tables, and that an existing saved scenario still opens.
