import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Employee } from "@/lib/budget/types";

export type EmployeeDraft = Omit<Employee, "id">;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function EmployeeFields({
  draft,
  disabled,
  onField,
}: {
  draft: EmployeeDraft;
  disabled?: boolean;
  onField: <K extends keyof EmployeeDraft>(k: K, v: EmployeeDraft[K]) => void;
}) {
  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const optNum = (v: string) => (v === "" ? undefined : num(v));

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Field label="Name">
        <Input
          className="h-8"
          value={draft.name ?? ""}
          disabled={disabled}
          onChange={(e) => onField("name", e.target.value)}
        />
      </Field>
      <Field label="Title">
        <Input
          className="h-8"
          value={draft.title}
          disabled={disabled}
          onChange={(e) => onField("title", e.target.value)}
        />
      </Field>
      <Field label="Headcount">
        <Input
          type="number"
          className="h-8 tabular-nums"
          value={draft.count}
          disabled={disabled}
          onChange={(e) => onField("count", Math.max(0, num(e.target.value)))}
        />
      </Field>
      <Field label="Base monthly salary">
        <Input
          type="number"
          className="h-8 tabular-nums"
          value={draft.baseMonthlySalary}
          disabled={disabled}
          onChange={(e) => onField("baseMonthlySalary", num(e.target.value))}
        />
      </Field>

      <Field label="Start year">
        <Input
          type="number"
          className="h-8 tabular-nums"
          value={draft.startYear ?? ""}
          placeholder="from start"
          disabled={disabled}
          onChange={(e) => onField("startYear", optNum(e.target.value))}
        />
      </Field>
      <Field label="Start month">
        <Input
          type="number"
          min={1}
          max={12}
          className="h-8 tabular-nums"
          value={draft.startMonth ?? ""}
          placeholder="1"
          disabled={disabled}
          onChange={(e) => onField("startMonth", optNum(e.target.value))}
        />
      </Field>
      <Field label="End year">
        <Input
          type="number"
          className="h-8 tabular-nums"
          value={draft.endYear ?? ""}
          placeholder="never"
          disabled={disabled}
          onChange={(e) => onField("endYear", optNum(e.target.value))}
        />
      </Field>
      <Field label="End month">
        <Input
          type="number"
          min={1}
          max={12}
          className="h-8 tabular-nums"
          value={draft.endMonth ?? ""}
          placeholder="12"
          disabled={disabled}
          onChange={(e) => onField("endMonth", optNum(e.target.value))}
        />
      </Field>
    </div>
  );
}
