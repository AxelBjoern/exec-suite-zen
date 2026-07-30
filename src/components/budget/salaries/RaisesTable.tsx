import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MONTHS } from "@/lib/budget/format";
import type { SalaryRaise } from "@/lib/budget/types";

export function RaisesTable({
  raises,
  disabled,
  defaultYear,
  onChange,
}: {
  raises: SalaryRaise[];
  disabled?: boolean;
  defaultYear: number;
  onChange: (next: SalaryRaise[]) => void;
}) {
  const set = (i: number, patch: Partial<SalaryRaise>) =>
    onChange(raises.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Scheduled raises
        </Label>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          disabled={disabled}
          onClick={() =>
            onChange([...raises, { year: defaultYear, month: 1, monthlySalary: 0 }])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add raise
        </Button>
      </div>

      {raises.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No raises scheduled.</p>
      )}

      <div className="space-y-2">
        {raises.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-end gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Year</Label>
              <Input
                type="number"
                className="h-8 tabular-nums"
                value={r.year}
                disabled={disabled}
                onChange={(e) => set(i, { year: num(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Month</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={r.month}
                disabled={disabled}
                onChange={(e) => set(i, { month: Number(e.target.value) })}
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">New monthly salary</Label>
              <Input
                type="number"
                className="h-8 tabular-nums"
                value={r.monthlySalary}
                disabled={disabled}
                onChange={(e) => set(i, { monthlySalary: num(e.target.value) })}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              disabled={disabled}
              title="Remove raise"
              onClick={() => onChange(raises.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
