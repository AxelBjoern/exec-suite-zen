import { createFileRoute } from "@tanstack/react-router";
import { useBudgetUi } from "@/lib/budget/store";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/budget/SectionHeader";

export const Route = createFileRoute("/_authenticated/budget/changelog")({
  ssr: false,
  component: ChangelogPage,
});

function ChangelogPage() {
  const log = useBudgetUi((s) => s.auditLog);
  const clear = useBudgetUi((s) => s.clearAudit);

  const groups = new Map<string, typeof log>();
  for (const e of log) {
    const day = new Date(e.ts).toLocaleDateString();
    const arr = groups.get(day) ?? [];
    arr.push(e);
    groups.set(day, arr);
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Changelog"
        description="Local audit log of recent edits (last 200)"
        action={log.length > 0 ? <Button size="sm" variant="ghost" onClick={clear}>Clear</Button> : undefined}
      />
      {log.length === 0 && <p className="text-sm text-muted-foreground">No edits yet.</p>}
      <div className="space-y-4">
        {Array.from(groups.entries()).map(([day, entries]) => (
          <div key={day}>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">{day}</div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-border">
                  {entries.map((e, i) => (
                    <tr key={i}>
                      <td className="w-20 px-2 py-1.5 text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</td>
                      <td className="w-40 px-2 py-1.5">{e.scenarioName}</td>
                      <td className="w-32 px-2 py-1.5 text-muted-foreground">{e.field}</td>
                      <td className="px-2 py-1.5">{e.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
