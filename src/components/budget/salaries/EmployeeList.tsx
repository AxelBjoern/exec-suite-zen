import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtSEK } from "@/lib/budget/format";
import { useBudgetStore } from "@/lib/budget/store";
import type { Scenario } from "@/lib/budget/types";
import { EmployeeRow } from "./EmployeeRow";

export function EmployeeList({
  scenario,
  yearLabel,
  socialFeesPct,
  salaryCost,
}: {
  scenario: Scenario;
  yearLabel: number;
  socialFeesPct: number;
  salaryCost: number;
}) {
  const addEmployee = useBudgetStore((s) => s.addEmployee);
  const updateEmployee = useBudgetStore((s) => s.updateEmployee);
  const removeEmployee = useBudgetStore((s) => s.removeEmployee);
  const setEmployeeRaises = useBudgetStore((s) => s.setEmployeeRaises);

  const locked = !!scenario.isLocked;
  const employees = scenario.assumptions.employees ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          One row per role. Add scheduled raises with an effective year and month. Empty start/end =
          active for the whole scenario.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={locked}
          onClick={() => addEmployee(scenario.id)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add employee
        </Button>
      </div>

      {employees.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No employees yet. Click "Add employee" to start.
        </div>
      )}

      <div className="space-y-4">
        {employees.map((emp) => (
          <EmployeeRow
            key={emp.id}
            emp={emp}
            yearLabel={yearLabel}
            socialFeesPct={socialFeesPct}
            locked={locked}
            onSave={(patch) => updateEmployee(scenario.id, emp.id, patch)}
            onSaveRaises={(raises) => setEmployeeRaises(scenario.id, emp.id, raises)}
            onRemove={() => {
              if (confirm(`Remove employee "${emp.title}"?`)) removeEmployee(scenario.id, emp.id);
            }}
          />
        ))}
      </div>

      <div className="mt-4 text-right text-[11px] text-muted-foreground">
        Year {yearLabel} salary cost (engine):{" "}
        <span className="font-semibold text-foreground tabular-nums">{fmtSEK(salaryCost)}</span>
      </div>
    </div>
  );
}
