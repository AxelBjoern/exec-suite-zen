// Board pack exports: Excel (xlsx), PDF (jspdf), PPTX (pptxgenjs). Client-side.

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";
import type { Assumptions, ComputedModel, Statements } from "./types";
import { buildStatements } from "./engine";

const fmt = (n: number) =>
  isFinite(n)
    ? new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(n))
    : "—";

const fmtCompact = (n: number) => {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} bn`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)} M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} k`;
  return `${sign}${abs.toFixed(0)}`;
};

export interface BoardPackContext {
  scenarioName: string;
  model: ComputedModel;
  statements: Statements;
  assumptions: Assumptions;
  generatedAt: Date;
}

export function buildBoardContext(
  scenarioName: string,
  assumptions: Assumptions,
  model: ComputedModel,
): BoardPackContext {
  return {
    scenarioName, model,
    statements: buildStatements(model, assumptions),
    assumptions,
    generatedAt: new Date(),
  };
}

export function exportExcel(ctx: BoardPackContext): void {
  const wb = XLSX.utils.book_new();

  const sum = ctx.model.yearly.map((y) => ({
    Year: y.year,
    "Ending customers": y.endingCustomers,
    Revenue: y.totalIncome,
    "Cost of goods": y.cogs,
    Subscriptions: y.subscriptionIncome,
    "Extra services": y.extraServicesIncome,

    "Financing income": y.financingIncome,
    "Financing cost": y.financingCost,
    EBITDA: y.ebitda,
    "Cash flow": y.cashFlow,
    CAC: y.cac,
    Churn: y.churnRate,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sum), "Summary");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    ctx.statements.pnl.map((r) => ({
      Year: r.year, Month: r.month, Revenue: r.revenue, COGS: r.cogs,
      "Gross profit": r.grossProfit, Opex: r.opex, EBITDA: r.ebitda,
      D_A: r.depreciation, EBIT: r.ebit, Interest: r.interest,
      EBT: r.ebt, Tax: r.tax, "Net income": r.netIncome,
    })),
  ), "P&L");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    ctx.statements.cashFlow.map((r) => ({
      Year: r.year, Month: r.month, "Net income": r.netIncome,
      Depreciation: r.depreciation, "Δ AR": r.changeAR, "Δ AP": r.changeAP,
      CFO: r.cfo, Capex: r.capex, CFI: r.cfi, "Debt Δ": r.debtChange,
      CFF: r.cff, "Net change": r.netChange, "Ending cash": r.endingCash,
    })),
  ), "Cash Flow");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    ctx.statements.balanceSheet.map((r) => ({
      Year: r.year, Month: r.month, Cash: r.cash, AR: r.accountsReceivable,
      "Fixed assets": r.fixedAssets, "Total assets": r.totalAssets,
      AP: r.accountsPayable, Debt: r.debt, "Total liabilities": r.totalLiabilities,
      Equity: r.equity, "L + E": r.totalLiabEquity, Check: r.check,
    })),
  ), "Balance Sheet");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    ctx.model.monthly.map((m) => ({
      Year: m.year, Month: m.month,
      "Starting cust": m.startingCustomers, New: m.newCustomers,
      Churned: m.churnedCustomers, "Ending cust": m.endingCustomers,
      Income: m.totalIncome, Cost: m.totalCost, EBITDA: m.ebitda,
      Subscriptions: m.subscriptionIncome, "Extra services": m.extraServicesIncome,
      "Financing in": m.financingIncome, "Financing cost": m.financingCost,
      "Financing out.": m.financingOutstanding,
    })),
  ), "Monthly");

  XLSX.writeFile(wb, fileName(ctx, "xlsx"));
}

export function exportPDF(ctx: BoardPackContext): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 80, "F");
  doc.setTextColor(255);
  doc.setFontSize(20);
  doc.text("Board Pack", 40, 50);
  doc.setFontSize(11);
  doc.text(
    `Scenario: ${ctx.scenarioName}  ·  Generated ${ctx.generatedAt.toLocaleDateString("sv-SE")}  ·  SEK`,
    40, 70,
  );
  doc.setTextColor(0);

  const totalRev = ctx.model.yearly.reduce((a, y) => a + y.totalIncome, 0);
  const totalEbitda = ctx.model.yearly.reduce((a, y) => a + y.ebitda, 0);
  const endCust = ctx.model.yearly[ctx.model.yearly.length - 1].endingCustomers;
  const endFin = ctx.model.yearly[ctx.model.yearly.length - 1].financingEndingOutstanding;

  autoTable(doc, {
    startY: 100,
    head: [["Horizon revenue", "Horizon EBITDA", "Ending customers", "Financing outstanding"]],
    body: [[fmtCompact(totalRev), fmtCompact(totalEbitda), fmt(endCust), fmtCompact(endFin)]],
    styles: { fontSize: 11, halign: "center" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
  });

  autoTable(doc, {
    head: [["Year", "Customers", "Revenue", "EBITDA", "Cash flow", "COGS", "Financing out."]],
    body: ctx.model.yearly.map((y) => [
      y.year, fmt(y.endingCustomers),
      fmtCompact(y.totalIncome), fmtCompact(y.ebitda), fmtCompact(y.cashFlow),
      fmtCompact(y.cogs), fmtCompact(y.financingEndingOutstanding),
    ]),

    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
  });

  doc.addPage();
  doc.setFontSize(14);
  doc.text("Annual P&L", 40, 40);
  const pnlByYear = aggregateByYear(ctx.statements.pnl, [
    "revenue", "cogs", "grossProfit", "opex", "ebitda",
    "depreciation", "ebit", "interest", "ebt", "tax", "netIncome",
  ]);
  autoTable(doc, {
    startY: 60,
    head: [["Year", "Revenue", "COGS", "Gross", "Opex", "EBITDA", "D&A", "EBIT", "Interest", "EBT", "Tax", "Net income"]],
    body: pnlByYear.map((r) => [
      r.year,
      ...["revenue", "cogs", "grossProfit", "opex", "ebitda", "depreciation", "ebit", "interest", "ebt", "tax", "netIncome"]
        .map((k) => fmtCompact((r as Record<string, number | string>)[k] as number)),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
  });

  doc.save(fileName(ctx, "pdf"));
}

export async function exportPPTX(ctx: BoardPackContext): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = `Board Pack — ${ctx.scenarioName}`;

  const NAVY = "0F172A";
  const ACCENT = "60A5FA";
  const TEXT = "111827";
  const MUTED = "64748B";

  const s1 = pptx.addSlide();
  s1.background = { color: NAVY };
  s1.addText("BOARD PACK", { x: 0.6, y: 2.6, w: 12, h: 0.6, color: "FFFFFF", fontFace: "Arial", fontSize: 36, bold: true, charSpacing: 12 });
  s1.addText("10-year financial plan", { x: 0.6, y: 3.4, w: 12, h: 0.5, color: ACCENT, fontFace: "Arial", fontSize: 20 });
  s1.addText(`Scenario: ${ctx.scenarioName}   ·   ${ctx.generatedAt.toLocaleDateString("sv-SE")}`,
    { x: 0.6, y: 6.5, w: 12, h: 0.4, color: "CBD5E1", fontFace: "Arial", fontSize: 14 });

  const totalRev = ctx.model.yearly.reduce((a, y) => a + y.totalIncome, 0);
  const totalEbitda = ctx.model.yearly.reduce((a, y) => a + y.ebitda, 0);
  const totalCash = ctx.model.yearly.reduce((a, y) => a + y.cashFlow, 0);
  const endCust = ctx.model.yearly[ctx.model.yearly.length - 1].endingCustomers;

  const s2 = pptx.addSlide();
  slideHeader(s2, "Horizon KPIs", ctx.scenarioName, NAVY, MUTED);
  const kpis: [string, string][] = [
    ["Revenue", fmtCompact(totalRev)],
    ["EBITDA", fmtCompact(totalEbitda)],
    ["Cash flow", fmtCompact(totalCash)],
    ["Ending customers", fmt(endCust)],
  ];
  kpis.forEach(([label, val], i) => {
    const x = 0.6 + i * 3.1;
    s2.addShape(pptx.ShapeType.rect, { x, y: 2.0, w: 2.9, h: 2.6, fill: { color: "F1F5F9" }, line: { color: "E2E8F0", width: 1 } });
    s2.addText(label, { x: x + 0.2, y: 2.2, w: 2.5, h: 0.4, color: MUTED, fontFace: "Arial", fontSize: 12, bold: true, charSpacing: 8 });
    s2.addText(val, { x: x + 0.2, y: 2.8, w: 2.5, h: 1.6, color: TEXT, fontFace: "Arial", fontSize: 36, bold: true });
  });

  const s3 = pptx.addSlide();
  slideHeader(s3, "Revenue & EBITDA · 10y", ctx.scenarioName, NAVY, MUTED);
  s3.addChart(pptx.ChartType.bar, [
    { name: "Revenue", labels: ctx.model.yearly.map((y) => String(y.year)), values: ctx.model.yearly.map((y) => Math.round(y.totalIncome)) },
    { name: "EBITDA", labels: ctx.model.yearly.map((y) => String(y.year)), values: ctx.model.yearly.map((y) => Math.round(y.ebitda)) },
  ], {
    x: 0.6, y: 1.5, w: 12, h: 5.5,
    barDir: "col", barGrouping: "clustered",
    chartColors: [ACCENT, NAVY],
    showLegend: true, legendPos: "b", legendFontSize: 11,
  });

  await pptx.writeFile({ fileName: fileName(ctx, "pptx") });
}

function slideHeader(slide: PptxGenJS.Slide, title: string, scenario: string, navy: string, muted: string) {
  slide.addText(title, { x: 0.6, y: 0.4, w: 12, h: 0.6, color: navy, fontFace: "Arial", fontSize: 26, bold: true });
  slide.addText(`Scenario · ${scenario}`, { x: 0.6, y: 1.0, w: 12, h: 0.3, color: muted, fontFace: "Arial", fontSize: 11, charSpacing: 4 });
  slide.addShape("rect", { x: 0.6, y: 1.35, w: 12, h: 0.02, fill: { color: "E2E8F0" }, line: { color: "E2E8F0", width: 0 } });
}

function aggregateByYear<T extends { year: number }>(
  rows: T[], numericKeys: (keyof T)[],
): Array<{ year: number } & Record<string, number>> {
  const map = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const cur = map.get(r.year) ?? Object.fromEntries(numericKeys.map((k) => [k as string, 0]));
    for (const k of numericKeys) {
      cur[k as string] = (cur[k as string] ?? 0) + (r[k] as unknown as number);
    }
    map.set(r.year, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, vals]) => ({ year, ...vals }));
}

function fileName(ctx: BoardPackContext, ext: string): string {
  const safe = ctx.scenarioName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const date = ctx.generatedAt.toISOString().slice(0, 10);
  return `board-pack-${safe}-${date}.${ext}`;
}
