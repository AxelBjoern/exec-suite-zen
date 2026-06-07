import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveScenario, useBudgetUi } from "@/lib/budget/store";
import { buildResults, compute, kpiForYear } from "@/lib/budget/engine";
import { fmtSEK, fmtNum, MONTHS } from "@/lib/budget/format";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { KpiCard } from "@/components/budget/KpiCard";

export const Route = createFileRoute("/_authenticated/budget/results")({
  ssr: false,
  component: ResultsPage,
});

function ResultsPage() {
  const active = useActiveScenario();
  const selectedYear = useBudgetUi((s) => s.selectedYear);
  const data = useMemo(() => {
    if (!active) return null;
    const model = compute(active.assumptions);
    return { model, kpi: kpiForYear(model, selectedYear), results: buildResults(model, active.actuals, selectedYear) };
  }, [active, selectedYear]);

  if (!active || !data) return <p className="text-sm text-muted-foreground">No scenario selected.</p>;
  const { kpi, results } = data;

  return (
    <div className="space-y-6">
      <SectionHeader title={`Results · ${selectedYear}`} description={`${active.name} — budget vs actuals`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Ending customers (B)" value={fmtNum(kpi.customers)} />
        <KpiCard label="Revenue (B)" value={fmtSEK(kpi.turnover, { compact: true })} />
        <KpiCard label="EBITDA (B)" value={fmtSEK(kpi.ebitda, { compact: true })} />
        <KpiCard label="Cash (B)" value={fmtSEK(kpi.cashFlow, { compact: true })} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard label="YTD revenue Δ" value={fmtSEK(results.ytdActual.income - results.ytdBudget.income, { compact: true })} hint={`Budget ${fmtSEK(results.ytdBudget.income, { compact: true })}`} />
        <KpiCard label="YTD cost Δ" value={fmtSEK(results.ytdActual.cost - results.ytdBudget.cost, { compact: true })} hint={`Budget ${fmtSEK(results.ytdBudget.cost, { compact: true })}`} />
        <KpiCard label="YTD EBITDA Δ" value={fmtSEK(results.ytdActual.ebitda - results.ytdBudget.ebitda, { compact: true })} hint={`Budget ${fmtSEK(results.ytdBudget.ebitda, { compact: true })}`} />
      </div>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Month</th>
              <th className="px-2 py-2 text-right">Rev (B)</th>
              <th className="px-2 py-2 text-right">Rev (A)</th>
              <th className="px-2 py-2 text-right">Δ Rev</th>
              <th className="px-2 py-2 text-right">EBITDA (B)</th>
              <th className="px-2 py-2 text-right">EBITDA (A)</th>
              <th className="px-2 py-2 text-right">Δ EBITDA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.rows.map((r) => (
              <tr key={r.month}>
                <td className="px-2 py-1.5">{MONTHS[r.month - 1]}</td>
                <td className="px-2 py-1.5 text-right">{fmtSEK(r.budget.income, { compact: true })}</td>
                <td className="px-2 py-1.5 text-right">{r.actual.income != null ? fmtSEK(r.actual.income, { compact: true }) : "—"}</td>
                <td className="px-2 py-1.5 text-right">{r.variance.income != null ? fmtSEK(r.variance.income, { compact: true }) : "—"}</td>
                <td className="px-2 py-1.5 text-right">{fmtSEK(r.budget.ebitda, { compact: true })}</td>
                <td className="px-2 py-1.5 text-right">{r.actual.ebitda != null ? fmtSEK(r.actual.ebitda, { compact: true }) : "—"}</td>
                <td className="px-2 py-1.5 text-right">{r.variance.ebitda != null ? fmtSEK(r.variance.ebitda, { compact: true }) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Actuals can be entered from a future "Actuals" tab; values default to budget when missing.</p>
    </div>
  );
}
