import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useBudgetStore, useBudgetUi } from "@/lib/budget/store";
import { compute } from "@/lib/budget/engine";
import { fmtSEK, fmtNum } from "@/lib/budget/format";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/budget/compare")({
  ssr: false,
  component: ComparePage,
});

function ComparePage() {
  const scenarios = useBudgetStore((s) => s.scenarios);
  const compareIds = useBudgetUi((s) => s.compareScenarios);
  const setCompare = useBudgetUi((s) => s.setCompareScenarios);

  const selected = useMemo(
    () => scenarios.filter((s) => compareIds.includes(s.id)).slice(0, 4),
    [scenarios, compareIds],
  );

  const models = useMemo(() => selected.map((s) => ({ s, m: compute(s.assumptions) })), [selected]);

  function toggle(id: string) {
    if (compareIds.includes(id)) setCompare(compareIds.filter((x) => x !== id));
    else setCompare([...compareIds, id]);
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Compare scenarios" description="Pick up to 4 scenarios to compare side-by-side" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {scenarios.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded border border-border bg-panel px-3 py-2 text-sm">
            <Checkbox checked={compareIds.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
            <span className="truncate">{s.name}</span>
          </label>
        ))}
      </div>
      {models.length === 0 ? (
        <p className="text-sm text-muted-foreground">Select scenarios above to compare.</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Metric</th>
                {models.map(({ s }) => <th key={s.id} className="px-2 py-2 text-right">{s.name}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <CompareRow label="Horizon revenue" values={models.map(({ m }) => fmtSEK(m.yearly.reduce((a, y) => a + y.totalIncome, 0), { compact: true }))} />
              <CompareRow label="Horizon EBITDA" values={models.map(({ m }) => fmtSEK(m.yearly.reduce((a, y) => a + y.ebitda, 0), { compact: true }))} />
              <CompareRow label="Horizon cash" values={models.map(({ m }) => fmtSEK(m.yearly.reduce((a, y) => a + y.cashFlow, 0), { compact: true }))} />
              <CompareRow label="Ending customers" values={models.map(({ m }) => fmtNum(m.yearly[m.yearly.length - 1].endingCustomers))} />
              <CompareRow label="Y1 revenue" values={models.map(({ m }) => fmtSEK(m.yearly[0].totalIncome, { compact: true }))} />
              <CompareRow label="Y1 EBITDA" values={models.map(({ m }) => fmtSEK(m.yearly[0].ebitda, { compact: true }))} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="px-2 py-1.5 text-muted-foreground">{label}</td>
      {values.map((v, i) => <td key={i} className="px-2 py-1.5 text-right">{v}</td>)}
    </tr>
  );
}
