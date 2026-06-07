import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useActiveScenario, useBudgetUi } from "@/lib/budget/store";
import { buildStatements, compute } from "@/lib/budget/engine";
import { fmtSEK, MONTHS } from "@/lib/budget/format";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/budget/statements")({
  ssr: false,
  component: StatementsPage,
});

function StatementsPage() {
  const active = useActiveScenario();
  const selectedYear = useBudgetUi((s) => s.selectedYear);
  const [tab, setTab] = useState("pnl");
  const stmts = useMemo(() => active ? buildStatements(compute(active.assumptions), active.assumptions) : null, [active]);
  if (!active || !stmts) return <p className="text-sm text-muted-foreground">No scenario selected.</p>;

  const pnl = stmts.pnl.filter((r) => r.year === selectedYear);
  const cf = stmts.cashFlow.filter((r) => r.year === selectedYear);
  const bs = stmts.balanceSheet.filter((r) => r.year === selectedYear);

  return (
    <div className="space-y-4">
      <SectionHeader title={`Statements · ${selectedYear}`} description={active.name} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          <TabsTrigger value="cf">Cash flow</TabsTrigger>
          <TabsTrigger value="bs">Balance sheet</TabsTrigger>
        </TabsList>
        <TabsContent value="pnl">
          <StmtTable cols={["Revenue", "COGS", "Gross", "Opex", "EBITDA", "Dep.", "EBIT", "Interest", "EBT", "Tax", "Net"]}
            rows={pnl.map((r) => [r.month, r.revenue, r.cogs, r.grossProfit, r.opex, r.ebitda, r.depreciation, r.ebit, r.interest, r.ebt, r.tax, r.netIncome])} />
        </TabsContent>
        <TabsContent value="cf">
          <StmtTable cols={["Net inc.", "Dep.", "ΔAR", "ΔAP", "CFO", "Capex", "CFI", "ΔDebt", "CFF", "Net Δ", "Cash"]}
            rows={cf.map((r) => [r.month, r.netIncome, r.depreciation, r.changeAR, r.changeAP, r.cfo, r.capex, r.cfi, r.debtChange, r.cff, r.netChange, r.endingCash])} />
        </TabsContent>
        <TabsContent value="bs">
          <StmtTable cols={["Cash", "AR", "Fixed", "Assets", "AP", "Debt", "Liab.", "Equity", "L+E", "Check"]}
            rows={bs.map((r) => [r.month, r.cash, r.accountsReceivable, r.fixedAssets, r.totalAssets, r.accountsPayable, r.debt, r.totalLiabilities, r.equity, r.totalLiabEquity, r.check])} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StmtTable({ cols, rows }: { cols: string[]; rows: (number)[][] }) {
  return (
    <div className="mt-3 overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-2 text-left">Month</th>
            {cols.map((c) => <th key={c} className="px-2 py-2 text-right">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-2 py-1.5">{MONTHS[(r[0] as number) - 1]}</td>
              {r.slice(1).map((v, j) => (
                <td key={j} className="px-2 py-1.5 text-right">{fmtSEK(v as number, { compact: true })}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
