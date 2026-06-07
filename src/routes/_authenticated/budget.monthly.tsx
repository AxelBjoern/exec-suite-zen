import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveScenario, useBudgetUi } from "@/lib/budget/store";
import { compute } from "@/lib/budget/engine";
import { fmtSEK, fmtNum, MONTHS } from "@/lib/budget/format";
import { SectionHeader } from "@/components/budget/SectionHeader";

export const Route = createFileRoute("/_authenticated/budget/monthly")({
  ssr: false,
  component: MonthlyPage,
});

function MonthlyPage() {
  const active = useActiveScenario();
  const selectedYear = useBudgetUi((s) => s.selectedYear);
  const model = useMemo(() => active ? compute(active.assumptions) : null, [active]);
  if (!active || !model) return <p className="text-sm text-muted-foreground">No scenario selected.</p>;

  const rows = model.monthly.filter((m) => m.year === selectedYear);

  return (
    <div className="space-y-4">
      <SectionHeader title={`Monthly · ${selectedYear}`} description={`${active.name} — month-by-month breakdown`} />
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Month</th>
              <th className="px-2 py-2 text-right">Customers</th>
              <th className="px-2 py-2 text-right">New</th>
              <th className="px-2 py-2 text-right">Churn</th>
              <th className="px-2 py-2 text-right">Revenue</th>
              <th className="px-2 py-2 text-right">COGS</th>
              <th className="px-2 py-2 text-right">Opex</th>
              <th className="px-2 py-2 text-right">EBITDA</th>
              <th className="px-2 py-2 text-right">Cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const cogs = r.electricityCost + r.certificateCost + r.streamCost + r.financingCost;
              const opex = r.invoicingCost + r.salesCost + r.salaryCost + r.otherExternal;
              return (
                <tr key={r.month}>
                  <td className="px-2 py-1.5">{MONTHS[r.month - 1]}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(r.endingCustomers)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtNum(r.newCustomers)}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtNum(r.churnedCustomers)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtSEK(r.totalIncome, { compact: true })}</td>
                  <td className="px-2 py-1.5 text-right">{fmtSEK(cogs, { compact: true })}</td>
                  <td className="px-2 py-1.5 text-right">{fmtSEK(opex, { compact: true })}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{fmtSEK(r.ebitda, { compact: true })}</td>
                  <td className="px-2 py-1.5 text-right">{fmtSEK(r.cashFlow, { compact: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
