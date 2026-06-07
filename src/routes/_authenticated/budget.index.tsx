import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveScenario, useBudgetStore, useBudgetUi } from "@/lib/budget/store";
import { compute, kpiForYear } from "@/lib/budget/engine";
import { fmtSEK, fmtNum, fmtPct } from "@/lib/budget/format";

export const Route = createFileRoute("/_authenticated/budget/")({
  ssr: false,
  component: BudgetOverview,
});

function BudgetOverview() {
  const active = useActiveScenario();
  const scenarios = useBudgetStore((s) => s.scenarios);
  const loaded = useBudgetStore((s) => s.loaded);
  const selectedYear = useBudgetUi((s) => s.selectedYear);

  const model = useMemo(() => active ? compute(active.assumptions) : null, [active]);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading scenarios…</p>;
  }

  if (!active || !model) {
    return (
      <div className="rounded-lg border border-border bg-panel px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No scenario selected. Create one from the scenario menu above to start modelling.
        </p>
      </div>
    );
  }

  const k = kpiForYear(model, selectedYear);
  const totals = model.yearly.reduce(
    (acc, y) => ({
      revenue: acc.revenue + y.totalIncome,
      ebitda: acc.ebitda + y.ebitda,
      cashFlow: acc.cashFlow + y.cashFlow,
    }),
    { revenue: 0, ebitda: 0, cashFlow: 0 },
  );
  const endCust = model.yearly[model.yearly.length - 1].endingCustomers;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Year {selectedYear} · {active.name}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Ending customers" value={fmtNum(k.customers)} />
          <Kpi label="Revenue" value={fmtSEK(k.turnover, { compact: true })} />
          <Kpi label="EBITDA" value={fmtSEK(k.ebitda, { compact: true })} />
          <Kpi label="Cash flow" value={fmtSEK(k.cashFlow, { compact: true })} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          {active.assumptions.years}-year horizon
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Horizon revenue" value={fmtSEK(totals.revenue, { compact: true })} />
          <Kpi label="Horizon EBITDA" value={fmtSEK(totals.ebitda, { compact: true })} />
          <Kpi label="Horizon cash" value={fmtSEK(totals.cashFlow, { compact: true })} />
          <Kpi label="Ending customers" value={fmtNum(endCust)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Annual summary
        </h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Year</th>
                <th className="px-3 py-2 text-right">Customers</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">EBITDA</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2 text-right">Cash flow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {model.yearly.map((y) => (
                <tr key={y.year} className={y.year === selectedYear ? "bg-accent/40" : ""}>
                  <td className="px-3 py-2">{y.year}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(y.endingCustomers)}</td>
                  <td className="px-3 py-2 text-right">{fmtSEK(y.totalIncome, { compact: true })}</td>
                  <td className="px-3 py-2 text-right">{fmtSEK(y.ebitda, { compact: true })}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {y.totalIncome ? fmtPct(y.ebitda / y.totalIncome) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtSEK(y.cashFlow, { compact: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        {scenarios.length} scenario{scenarios.length === 1 ? "" : "s"} in your workspace. Switch via the
        scenario menu above. Editor tabs (Assumptions, Monthly, Statements, …) ship in the next wave.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-2xl font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
