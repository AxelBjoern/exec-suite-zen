import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmtSEK } from "@/lib/budget/format";
import { salaryInForce } from "@/lib/budget/engine";
import type { Employee, SalaryRaise } from "@/lib/budget/types";
import { EmployeeFields, type EmployeeDraft } from "./EmployeeFields";
import { RaisesTable } from "./RaisesTable";

const toDraft = (e: Employee): EmployeeDraft => ({
  name: e.name ?? "",
  title: e.title,
  count: e.count,
  baseMonthlySalary: e.baseMonthlySalary,
  startYear: e.startYear,
  startMonth: e.startMonth,
  endYear: e.endYear,
  endMonth: e.endMonth,
  raises: e.raises ?? [],
});

export function EmployeeRow({
  emp,
  yearLabel,
  socialFeesPct,
  locked,
  onSave,
  onSaveRaises,
  onRemove,
}: {
  emp: Employee;
  yearLabel: number;
  socialFeesPct: number;
  locked: boolean;
  onSave: (patch: Partial<Employee>) => void;
  onSaveRaises: (raises: SalaryRaise[]) => void;
  onRemove: () => void;
}) {
  const stored = useMemo(() => toDraft(emp), [emp]);
  const [draft, setDraft] = useState<EmployeeDraft>(stored);

  useEffect(() => setDraft(stored), [stored]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);

  const yearCost = useMemo(() => {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const sY = draft.startYear ?? -Infinity;
      const sM = draft.startMonth ?? 1;
      const key = yearLabel * 12 + m;
      if (draft.startYear != null && key < sY * 12 + sM) continue;
      if (draft.endYear != null && key > draft.endYear * 12 + (draft.endMonth ?? 12)) continue;
      total +=
        draft.count *
        salaryInForce({ ...draft, id: emp.id } as Employee, yearLabel, m);
    }
    return total * (1 + socialFeesPct);
  }, [draft, emp.id, socialFeesPct, yearLabel]);

  const setField = <K extends keyof EmployeeDraft>(k: K, v: EmployeeDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    onSave({
      name: draft.name,
      title: draft.title,
      count: draft.count,
      baseMonthlySalary: draft.baseMonthlySalary,
      startYear: draft.startYear,
      startMonth: draft.startMonth,
      endYear: draft.endYear,
      endMonth: draft.endMonth,
    });
    onSaveRaises(draft.raises);
    toast.success("Employee saved");
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {draft.title || "Untitled role"}
          {draft.name ? <span className="text-muted-foreground"> · {draft.name}</span> : null}
        </span>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-[11px] text-muted-foreground">
            {yearLabel} cost incl. social fees:{" "}
            <span className="font-semibold text-foreground tabular-nums">{fmtSEK(yearCost)}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            disabled={locked}
            title="Remove employee"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <EmployeeFields draft={draft} disabled={locked} onField={setField} />

      <RaisesTable
        raises={draft.raises}
        disabled={locked}
        defaultYear={yearLabel}
        onChange={(raises) => setField("raises", raises)}
      />

      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          disabled={!dirty}
          onClick={() => setDraft(stored)}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Cancel
        </Button>
        <Button size="sm" className="h-8" disabled={!dirty || locked} onClick={save}>
          <Save className="mr-1 h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </Card>
  );
}
