import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveScenario } from "@/lib/budget/store";
import { buildFinancing } from "@/lib/budget/financing";
import { fmtSEK } from "@/lib/budget/format";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { KpiCard } from "@/components/budget/KpiCard";

export const Route = createFileRoute("/_authenticated/budget/financing")({
  ssr: false,
  component: FinancingPage,
});

function FinancingPage() {
  const active = useActiveScenario();
  const fin = useMemo(() => active ? buildFinancing(active.assumptions) : null, [active]);
  if (!active || !fin) return <p className="text-sm text-muted-foreground">No scenario selected.</p>;

  const enabled = active.assumptions.financing?.enabled;
  const totals = fin.yearly.reduce((a, y) => ({
    income: a.income + y.totalIncome,
    cost: a.cost + y.totalCost,
    net: a.net + y.netMargin,
    end: y.endingOutstanding,
  }), { income: 0, cost: 0, net: 0, end: 0 });

  return (
    <div className="space-y-6">
      <SectionHeader title="Financing portfolio" description={enabled ? `${active.name} — installment financing book` : "Financing is disabled in this scenario."} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Income" value={fmtSEK(totals.income, { compact: true })} />
        <KpiCard label="Cost" value={fmtSEK(totals.cost, { compact: true })} />
        <KpiCard label="Net margin" value={fmtSEK(totals.net, { compact: true })} />
        <KpiCard label="Ending outstanding" value={fmtSEK(totals.end, { compact: true })} />
      </div>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Year</th>
              <th className="px-2 py-2 text-right">Originations</th>
              <th className="px-2 py-2 text-right">Disbursed</th>
              <th className="px-2 py-2 text-right">Repaid</th>
              <th className="px-2 py-2 text-right">Defaults</th>
              <th className="px-2 py-2 text-right">Income</th>
              <th className="px-2 py-2 text-right">Cost</th>
              <th className="px-2 py-2 text-right">Net</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fin.yearly.map((y) => (
              <tr key={y.year}>
                <td className="px-2 py-1.5">{y.year}</td>
                <td className="px-2 py-1.5 text-right">{y.newOriginations.toFixed(0)}</td>
                <td className="px-2 py-1.5 text-right">{fmtSEK(y.disbursed, { compact: true })}</td>
                <td className="px-2 py-1.5 text-right">{fmtSEK(y.principalRepaid, { compact: true })}</td>
                <td className="px-2 py-1.5 text-right text-destructive">{fmtSEK(y.defaultLoss, { compact: true })}</td>
                <td className="px-2 py-1.5 text-right">{fmtSEK(y.totalIncome, { compact: true })}</td>
                <td className="px-2 py-1.5 text-right">{fmtSEK(y.totalCost, { compact: true })}</td>
                <td className="px-2 py-1.5 text-right font-medium">{fmtSEK(y.netMargin, { compact: true })}</td>
                <td className="px-2 py-1.5 text-right">{fmtSEK(y.endingOutstanding, { compact: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
