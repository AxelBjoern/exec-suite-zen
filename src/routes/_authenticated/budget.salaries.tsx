import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { compute } from "@/lib/budget/engine";
import { useActiveScenario, useBudgetUi } from "@/lib/budget/store";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { EmployeeList } from "@/components/budget/salaries/EmployeeList";

export const Route = createFileRoute("/_authenticated/budget/salaries")({
  ssr: false,
  component: SalariesPage,
});

function SalariesPage() {
  const active = useActiveScenario();
  const selectedYear = useBudgetUi((s) => s.selectedYear);

  const yearIndex = active
    ? Math.max(0, selectedYear - active.assumptions.startYear)
    : 0;

  const salaryCost = useMemo(() => {
    if (!active) return 0;
    const model = compute(active.assumptions);
    return model.yearly.find((y) => y.year === selectedYear)?.salaryCost ?? 0;
  }, [active, selectedYear]);

  if (!active) return <p className="text-sm text-muted-foreground">No scenario selected.</p>;

  const ya = active.assumptions.perYear[yearIndex];

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Salaries · ${selectedYear}`}
        description={
          active.isLocked
            ? "Scenario is locked — the roster is read-only."
            : "Scenario-level employee roster. Edits autosave to your workspace."
        }
      />
      <EmployeeList
        scenario={active}
        yearLabel={selectedYear}
        socialFeesPct={ya?.socialFeesPct ?? 0}
        salaryCost={salaryCost}
      />
    </div>
  );
}
