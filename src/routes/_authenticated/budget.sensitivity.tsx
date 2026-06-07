import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useActiveScenario } from "@/lib/budget/store";
import { buildSensitivity } from "@/lib/budget/sensitivity";
import { fmtSEK, fmtPct } from "@/lib/budget/format";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/budget/sensitivity")({
  ssr: false,
  component: SensitivityPage,
});

function SensitivityPage() {
  const active = useActiveScenario();
  const [delta, setDelta] = useState(0.1);
  const result = useMemo(() => active ? buildSensitivity(active.assumptions, delta) : null, [active, delta]);
  if (!active || !result) return <p className="text-sm text-muted-foreground">No scenario selected.</p>;

  const maxSpread = Math.max(...result.rows.map((r) => r.spread), 1);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Sensitivity"
        description={`Tornado · ±${fmtPct(delta, 0)} per driver · base horizon EBITDA ${fmtSEK(result.baseEbitda, { compact: true })}`}
        action={
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Δ</Label>
            <Input type="number" step="0.01" min="0.01" max="0.5"
              className="h-8 w-20 tabular-nums" value={delta}
              onChange={(e) => setDelta(Math.max(0.01, Math.min(0.5, Number(e.target.value) || 0.1)))} />
          </div>
        }
      />
      <div className="space-y-1.5">
        {result.rows.map((r) => {
          const leftPct = (Math.min(r.lowDelta, r.highDelta) / maxSpread) * 50;
          const rightPct = (Math.max(r.lowDelta, r.highDelta) / maxSpread) * 50;
          return (
            <div key={r.key} className="grid grid-cols-[180px_1fr_180px] items-center gap-3 text-xs">
              <span className="truncate text-muted-foreground">{r.label}</span>
              <div className="relative h-5 rounded bg-muted/30">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
                <div
                  className="absolute top-0 bottom-0 bg-destructive/60"
                  style={{ left: `${50 + leftPct}%`, width: `${Math.abs(leftPct)}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 bg-primary/60"
                  style={{ left: "50%", width: `${rightPct}%` }}
                />
              </div>
              <span className="text-right tabular-nums text-muted-foreground">
                {fmtSEK(r.lowDelta, { compact: true })} / +{fmtSEK(r.highDelta, { compact: true })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
