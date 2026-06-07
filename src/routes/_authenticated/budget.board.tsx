import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useActiveScenario, useBudgetStore } from "@/lib/budget/store";
import { compute } from "@/lib/budget/engine";
import { fmtSEK, fmtNum, fmtPct } from "@/lib/budget/format";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { KpiCard } from "@/components/budget/KpiCard";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Presentation, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { buildBoardContext, exportExcel, exportPDF, exportPPTX } from "@/lib/budget/exports";
import { useServerFn } from "@tanstack/react-start";
import { promoteScenarioToVdnx } from "@/lib/budget/admin.functions";

export const Route = createFileRoute("/_authenticated/budget/board")({
  ssr: false,
  component: BoardPage,
});

function BoardPage() {
  const active = useActiveScenario();
  const refresh = useBudgetStore((s) => s.refresh);
  const flush = useBudgetStore((s) => s.flush);
  const model = useMemo(() => active ? compute(active.assumptions) : null, [active]);
  const promote = useServerFn(promoteScenarioToVdnx);
  const [busy, setBusy] = useState<string | null>(null);

  if (!active || !model) return <p className="text-sm text-muted-foreground">No scenario selected.</p>;

  const ctx = buildBoardContext(active.name, active.assumptions, model);
  const totals = model.yearly.reduce((a, y) => ({
    revenue: a.revenue + y.totalIncome,
    ebitda: a.ebitda + y.ebitda,
    cash: a.cash + y.cashFlow,
  }), { revenue: 0, ebitda: 0, cash: 0 });
  const endCust = model.yearly[model.yearly.length - 1].endingCustomers;
  const margin = totals.revenue ? totals.ebitda / totals.revenue : 0;

  async function withBusy(kind: string, fn: () => Promise<void> | void) {
    try {
      setBusy(kind);
      await fn();
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Board one-pager"
        description={`${active.name} · ${active.assumptions.years}-year horizon`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => withBusy("xlsx", () => exportExcel(ctx))}>
              {busy === "xlsx" ? <Download className="h-3.5 w-3.5 animate-pulse" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Excel</span>
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => withBusy("pdf", () => exportPDF(ctx))}>
              {busy === "pdf" ? <Download className="h-3.5 w-3.5 animate-pulse" /> : <FileText className="h-3.5 w-3.5" />}
              <span className="ml-1.5">PDF</span>
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => withBusy("pptx", () => exportPPTX(ctx))}>
              {busy === "pptx" ? <Download className="h-3.5 w-3.5 animate-pulse" /> : <Presentation className="h-3.5 w-3.5" />}
              <span className="ml-1.5">PPTX</span>
            </Button>
            {!active.isSystem && (
              <Button size="sm" variant="default" disabled={!!busy}
                onClick={() => withBusy("promote", async () => {
                  if (!confirm(`Promote "${active.name}" to VDNX baseline? This makes it read-only and visible to all users.`)) return;
                  await flush();
                  await promote({ data: { id: active.id } });
                  await refresh();
                  toast.success(`Promoted "${active.name}" to VDNX baseline`);
                })}>
                <Sparkles className="h-3.5 w-3.5" />
                <span className="ml-1.5">Promote to VDNX</span>
              </Button>
            )}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Ending customers" value={fmtNum(endCust)} />
        <KpiCard label="Horizon revenue" value={fmtSEK(totals.revenue, { compact: true })} />
        <KpiCard label="Horizon EBITDA" value={fmtSEK(totals.ebitda, { compact: true })} hint={fmtPct(margin)} />
        <KpiCard label="Horizon cash" value={fmtSEK(totals.cash, { compact: true })} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Year</th>
              <th className="px-3 py-2 text-right">Customers</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">EBITDA</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">Cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {model.yearly.map((y) => (
              <tr key={y.year}>
                <td className="px-3 py-2">{y.year}</td>
                <td className="px-3 py-2 text-right">{fmtNum(y.endingCustomers)}</td>
                <td className="px-3 py-2 text-right">{fmtSEK(y.totalIncome, { compact: true })}</td>
                <td className="px-3 py-2 text-right">{fmtSEK(y.ebitda, { compact: true })}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{y.totalIncome ? fmtPct(y.ebitda / y.totalIncome) : "—"}</td>
                <td className="px-3 py-2 text-right">{fmtSEK(y.cashFlow, { compact: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
