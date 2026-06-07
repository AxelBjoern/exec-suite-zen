import { createFileRoute } from "@tanstack/react-router";
import { useBudgetStore, useBudgetUi } from "@/lib/budget/store";
import { Button } from "@/components/ui/button";
import { Copy, Lock, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/budget/SectionHeader";

export const Route = createFileRoute("/_authenticated/budget/scenarios")({
  ssr: false,
  component: ScenariosPage,
});

function ScenariosPage() {
  const scenarios = useBudgetStore((s) => s.scenarios);
  const duplicate = useBudgetStore((s) => s.duplicateScenario);
  const remove = useBudgetStore((s) => s.deleteScenario);
  const toggleLock = useBudgetStore((s) => s.toggleLock);
  const setBase = useBudgetStore((s) => s.setBaseScenario);
  const setActive = useBudgetUi((s) => s.setActiveScenario);
  const activeId = useBudgetUi((s) => s.activeScenarioId);

  return (
    <div className="space-y-4">
      <SectionHeader title="Scenarios" description="All scenarios in your workspace" />
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Flags</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scenarios.map((s) => (
              <tr key={s.id} className={activeId === s.id ? "bg-accent/40" : ""}>
                <td className="px-3 py-2">
                  <button onClick={() => setActive(s.id)} className="font-medium hover:underline">{s.name}</button>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-1">
                    {s.isSystem && <span className="rounded border border-primary/40 px-1.5 py-0.5 text-primary">VDNX</span>}
                    {s.isBase && <span className="rounded border border-border px-1.5 py-0.5">Base</span>}
                    {s.isLocked && <span className="rounded border border-border px-1.5 py-0.5">Locked</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => duplicate(s.id).then((c) => c && toast.success(`Duplicated as ${c.name}`)).catch((e) => toast.error(e.message))}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {!s.isSystem && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setBase(s.id).catch((e) => toast.error(e.message))}>
                          <Star className={`h-3.5 w-3.5 ${s.isBase ? "fill-primary text-primary" : ""}`} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleLock(s.id).catch((e) => toast.error(e.message))}>
                          <Lock className={`h-3.5 w-3.5 ${s.isLocked ? "text-primary" : ""}`} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (confirm(`Delete "${s.name}"?`)) remove(s.id).catch((e) => toast.error(e.message));
                        }}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
