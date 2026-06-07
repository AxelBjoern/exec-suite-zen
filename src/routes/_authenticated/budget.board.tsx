import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveScenario } from "@/lib/budget/store";
import { compute } from "@/lib/budget/engine";
import { fmtSEK, fmtNum, fmtPct } from "@/lib/budget/format";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { KpiCard } from "@/components/budget/KpiCard";

export const Route = createFileRoute("/_authenticated/budget/board")({
  ssr: false,
  component: BoardPage,
});

function BoardPage() {
  const active = useActiveScenario();
  const model = useMemo(() => active ? compute(active.assumptions) : null, [active]);
  if (!active || !model) return <p className="text-sm text-muted-foreground">No scenario selected.</p>;

  const totals = model.yearly.reduce((a, y) => ({
    revenue: a.revenue + y.totalIncome,
    ebitda: a.ebitda + y.ebitda,
    cash: a.cash + y.cashFlow,
  }), { revenue: 0, ebitda: 0, cash: 0 });
  const endCust = model.yearly[model.yearly.length - 1].endingCustomers;
  const margin = totals.revenue ? totals.ebitda / totals.revenue : 0;

  return (
    <div className="space-y-6">
      <SectionHeader title="Board one-pager" description={`${active.name} · ${active.assumptions.years}-year horizon`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Ending customers" value={fmtNum(endCust)} />
        <KpiCard label="Horizon revenue" value={fmtSEK(totals.revenue, { compact: true })} />
        <KpiCard label="Horizon EBITDA" value={fmtSEK(totals.ebitda, { compact: true })} hint={fmtPct(margin)} />
        <KpiCard label="Horizon cash" value={fmtSEK(totals.cash, { compact: true })} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Year</th>
              <th className="px-3 py-2 text-right">Customers</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">EBITDA</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">Cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {model.yearly.map((y) => (
              <tr key={y.year}>
                <td className="px-3 py-2">{y.year}</td>
                <td className="px-3 py-2 text-right">{fmtNum(y.endingCustomers)}</td>
                <td className="px-3 py-2 text-right">{fmtSEK(y.totalIncome, { compact: true })}</td>
                <td className="px-3 py-2 text-right">{fmtSEK(y.ebitda, { compact: true })}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{y.totalIncome ? fmtPct(y.ebitda / y.totalIncome) : "—"}</td>
                <td className="px-3 py-2 text-right">{fmtSEK(y.cashFlow, { compact: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Exports (XLSX / PDF / PPTX) ship in Wave C.</p>
    </div>
  );
}
