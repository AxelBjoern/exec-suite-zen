import { createFileRoute } from "@tanstack/react-router";
import { LineChart, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/budget")({
  head: () => ({ meta: [{ title: "Budget — VDNX" }] }),
  component: BudgetShell,
});

function BudgetShell() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <LineChart className="h-7 w-7 text-primary" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Module
          </p>
          <h1 className="font-serif text-3xl font-bold text-foreground">Budget</h1>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-panel p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Module scaffolded</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Database tables{" "}
              <code className="rounded bg-panel-2 px-1 py-0.5 text-[11px]">
                budget_scenarios
              </code>{" "}
              and{" "}
              <code className="rounded bg-panel-2 px-1 py-0.5 text-[11px]">
                budget_audit
              </code>{" "}
              are live with per-user RLS. The full engine, scenarios UI, statements and
              sensitivity pages from Budget Dashboard Buddy port in the next wave.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Sub-routes: overview · board · monthly · statements · compare · scenarios · sensitivity · financing · results · changelog</li>
              <li>Engine ported from <code>src/lib/budget/*</code></li>
              <li>Persistence: React Query + server fns (zustand cache kept for editing)</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
