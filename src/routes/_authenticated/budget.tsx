import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { LineChart } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { BudgetTopbar } from "@/components/budget/Topbar";
import { useBudgetStore } from "@/lib/budget/store";

export const Route = createFileRoute("/_authenticated/budget")({
  ssr: false,
  head: () => ({ meta: [{ title: "Budget — VDNX" }] }),
  component: BudgetLayout,
});

function BudgetLayout() {
  const subscribeRealtime = useBudgetStore((s) => s.subscribeRealtime);
  useEffect(() => subscribeRealtime(), [subscribeRealtime]);
  return (
    <div className="min-h-screen bg-background">
      <Toaster theme="dark" position="top-right" />
      <div className="border-b border-border bg-panel">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-4">
          <LineChart className="h-6 w-6 text-primary" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Module</p>
            <h1 className="font-serif text-2xl font-bold text-foreground">Budget</h1>
          </div>
          <p className="ml-4 hidden text-xs text-muted-foreground md:block">
            Multi-scenario 10-year financial planning. Edits sync to your Lovable Cloud workspace.
          </p>
        </div>
      </div>
      <BudgetTopbar />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
