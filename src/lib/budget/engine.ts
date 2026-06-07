// Pure budget computation engine.

import { buildFinancing } from "./financing";
import type {
  Actuals,
  Assumptions,
  BalanceSheetRow,
  CashFlowRow,
  ComputedModel,
  MonthlyRow,
  PnLRow,
  PriceAreaKey,
  SalaryRole,
  Statements,
  StreamAssumptions,
  StreamKey,
  YearAssumptions,
  YearlyRow,
  ChannelKey,
} from "./types";

const PRICE_AREAS: PriceAreaKey[] = ["SE1", "SE2", "SE3", "SE4"];
const STREAM_KEYS: StreamKey[] = ["solar", "battery", "vpp", "saas"];

function emptyStreamBreakdown<T extends { revenue: number; cost: number }>(extra: (k: StreamKey) => T): Record<StreamKey, T> {
  return { solar: extra("solar"), battery: extra("battery"), vpp: extra("vpp"), saas: extra("saas") };
}

function sumChannels(by: Record<ChannelKey, number>): number {
  return Object.values(by).reduce((a, b) => a + b, 0);
}

function roleActive(r: SalaryRole, startYear: number, year: number, month: number): boolean {
  const sY = r.startYear ?? startYear;
  const sM = r.startMonth ?? 1;
  const eY = r.endYear;
  const eM = r.endMonth ?? 12;
  const ymKey = year * 12 + month;
  if (ymKey < sY * 12 + sM) return false;
  if (eY != null && ymKey > eY * 12 + eM) return false;
  return true;
}

function monthlySalaryCost(y: YearAssumptions, startYear: number, year: number, month: number): number {
  const base = y.salaries.reduce((acc, r) => {
    if (!roleActive(r, startYear, year, month)) return acc;
    return acc + r.count * r.monthlySalary;
  }, 0);
  return base * (1 + y.socialFeesPct);
}

export function compute(a: Assumptions): ComputedModel {
  const monthly: MonthlyRow[] = [];
  const yearly: YearlyRow[] = [];

  let runningStart = a.perYear[0].startingCustomers;
  const appreciation = a.salesAppreciationPct ?? 0;

  const streamActive: Record<StreamKey, number> = {
    solar: a.perYear[0].streams?.solar?.startingUnits ?? 0,
    battery: a.perYear[0].streams?.battery?.startingUnits ?? 0,
    vpp: a.perYear[0].streams?.vpp?.startingUnits ?? 0,
    saas: a.perYear[0].streams?.saas?.startingUnits ?? 0,
  };

  const financing = buildFinancing(a);
  const finByKey = new Map<string, ReturnType<typeof buildFinancing>["monthly"][number]>();
  for (const r of financing.monthly) finByKey.set(`${r.year}-${r.month}`, r);

  for (let y = 0; y < a.years; y++) {
    const ya = a.perYear[y];
    const yearStartCustomers = y === 0 ? ya.startingCustomers : runningStart;
    const yearLabel = a.startYear + y;
    const sellMult = Math.pow(1 + appreciation, y);

    const newCustomersYear = sumChannels(ya.newCustomersByChannel);
    const salesStartMonth = Math.min(12, Math.max(1, ya.salesStartMonth ?? 1));
    const activeMonths = 12 - (salesStartMonth - 1);
    const newPerMonth = activeMonths > 0 ? newCustomersYear / activeMonths : 0;
    const monthlyChurnRate = 1 - Math.pow(1 - ya.churnRate, 1 / 12);

    const otherExtMonth = ya.otherExternalExpenses / 12;
    const loanMonth = ya.loanInterest / 12;
    const salesCostYear = newCustomersYear * ya.acquisitionCostPerCustomer;
    const salesPerActiveMonth = activeMonths > 0 ? salesCostYear / activeMonths : 0;

    let active = yearStartCustomers;
    const yearAgg: YearlyRow = {
      year: yearLabel,
      startingCustomers: yearStartCustomers,
      endingCustomers: 0, newCustomers: 0, churnedCustomers: 0,
      totalIncome: 0, totalCost: 0, ebitda: 0, cashFlow: 0,
      cac: ya.acquisitionCostPerCustomer, churnRate: ya.churnRate,
      electricityIncome: 0, certificateIncome: 0, extraServicesIncome: 0, subscriptionIncome: 0,
      electricityCost: 0, certificateCost: 0, salesCost: 0, salaryCost: 0,
      otherExternal: 0, invoicingCost: 0, loanInterest: 0,
      volumeByArea: { SE1: 0, SE2: 0, SE3: 0, SE4: 0 },
      revenueByArea: { SE1: 0, SE2: 0, SE3: 0, SE4: 0 },
      cogsByArea: { SE1: 0, SE2: 0, SE3: 0, SE4: 0 },
      streamIncome: 0, streamCost: 0,
      streamsBreakdown: emptyStreamBreakdown((k) => ({ revenue: 0, cost: 0, endingUnits: streamActive[k] })),
      financingIncome: 0, financingCost: 0, financingEndingOutstanding: 0,
    };

    for (let m = 1; m <= 12; m++) {
      const startCust = active;
      const isSalesActive = m >= salesStartMonth;
      const newCust = isSalesActive ? newPerMonth : 0;
      const salesMonth = isSalesActive ? salesPerActiveMonth : 0;
      const churned = (startCust + newCust / 2) * monthlyChurnRate;
      const endCust = startCust + newCust - churned;
      const avgCust = (startCust + endCust) / 2;

      const salaryMonth = monthlySalaryCost(ya, a.startYear, yearLabel, m);
      const kwhMonth = (avgCust * ya.kwhPerCustomerYear) / 12;

      const useArea = !!(ya.useAreaPricing && ya.priceAreaPricing);
      let electricityIncome = 0;
      let certificateIncome = 0;
      let electricityCost = 0;
      let certificateCost = 0;
      const monthRevenueByArea: Record<PriceAreaKey, number> = { SE1: 0, SE2: 0, SE3: 0, SE4: 0 };
      const monthCogsByArea: Record<PriceAreaKey, number> = { SE1: 0, SE2: 0, SE3: 0, SE4: 0 };

      if (useArea) {
        for (const k of PRICE_AREAS) {
          const p = ya.priceAreaPricing![k];
          const kwhArea = kwhMonth * ya.priceAreaShare[k];
          const sellSEK = ((p.avgPurchaseOre + p.pslagOre) / 100) * sellMult;
          const costSEK = p.avgPurchaseOre / 100;
          const certSEK = p.elcertOre / 100;
          const eIncA = kwhArea * sellSEK * (1 + ya.surchargePct);
          const cIncA = kwhArea * certSEK;
          const eCostA = kwhArea * costSEK;
          const cCostA = kwhArea * certSEK;
          electricityIncome += eIncA;
          certificateIncome += cIncA;
          electricityCost += eCostA;
          certificateCost += cCostA;
          monthRevenueByArea[k] = eIncA + cIncA;
          monthCogsByArea[k] = eCostA + cCostA;
        }
      } else {
        electricityIncome = kwhMonth * ya.pricePerKwh * sellMult * (1 + ya.surchargePct);
        certificateIncome = kwhMonth * ya.certificateCostPerKwh;
        electricityCost = kwhMonth * ya.costPerKwh;
        certificateCost = kwhMonth * ya.certificateCostPerKwh;
      }

      const extraServicesIncome = (avgCust * ya.extraServicesPerCustomerYear * sellMult) / 12;
      const subscriptionIncome = (avgCust * ya.subscriptionPerCustomerYear * sellMult) / 12;
      const invoicingCost = (avgCust * ya.invoicingCostPerCustomer) / 12;

      let streamIncome = 0;
      let streamCost = 0;
      const streamsMonth: Record<StreamKey, { revenue: number; cost: number; activeUnits: number }> =
        emptyStreamBreakdown((k) => ({ revenue: 0, cost: 0, activeUnits: streamActive[k] }));
      for (const sk of STREAM_KEYS) {
        const s: StreamAssumptions | undefined = ya.streams?.[sk];
        if (!s || !s.enabled) {
          streamsMonth[sk] = { revenue: 0, cost: 0, activeUnits: streamActive[sk] };
          continue;
        }
        const newU = s.newUnitsPerYear / 12;
        const mChurn = s.annualChurnPct > 0 ? 1 - Math.pow(1 - s.annualChurnPct, 1 / 12) : 0;
        const startU = streamActive[sk];
        const churnU = (startU + newU / 2) * mChurn;
        const endU = startU + newU - churnU;
        const avgU = (startU + endU) / 2;
        const oneTimeRev = newU * s.oneTimeRevenuePerUnit;
        const oneTimeCost = oneTimeRev * s.oneTimeCogsPct;
        const recRev = avgU * s.recurringMonthlyPerUnit;
        const recCost = recRev * s.recurringCogsPct;
        const rev = oneTimeRev + recRev;
        const cost = oneTimeCost + recCost;
        streamsMonth[sk] = { revenue: rev, cost, activeUnits: endU };
        streamIncome += rev;
        streamCost += cost;
        streamActive[sk] = endU;
      }

      const fin = finByKey.get(`${yearLabel}-${m}`);
      const financingIncome = fin?.totalIncome ?? 0;
      const financingCost = fin?.totalCost ?? 0;
      const financingOutstanding = fin?.outstanding ?? 0;

      const totalIncome =
        electricityIncome + certificateIncome + extraServicesIncome +
        subscriptionIncome + streamIncome + financingIncome;

      const totalCost =
        electricityCost + certificateCost + invoicingCost + salesMonth +
        salaryMonth + otherExtMonth + loanMonth + streamCost + financingCost;

      const ebitda = totalIncome - totalCost + loanMonth;
      const cashFlow = totalIncome - totalCost;

      const vatOut = totalIncome * a.vatRate;
      const vatIn =
        (electricityCost + certificateCost + invoicingCost +
         otherExtMonth + salesMonth + streamCost) * a.vatRate;

      const row: MonthlyRow = {
        year: yearLabel, month: m,
        startingCustomers: Math.round(startCust),
        newCustomers: Math.round(newCust),
        churnedCustomers: Math.round(churned),
        endingCustomers: Math.round(endCust),
        electricityIncome, certificateIncome, extraServicesIncome, subscriptionIncome,
        totalIncome,
        electricityCost, certificateCost, invoicingCost,
        salesCost: salesMonth, salaryCost: salaryMonth,
        otherExternal: otherExtMonth, loanInterest: loanMonth,
        totalCost,
        streamIncome, streamCost, streamsBreakdown: streamsMonth,
        financingIncome, financingCost, financingOutstanding,
        ebitda, cashFlow,
        vatOut, vatIn, vatNet: vatOut - vatIn,
      };
      monthly.push(row);

      yearAgg.newCustomers += newCust;
      yearAgg.churnedCustomers += churned;
      yearAgg.totalIncome += totalIncome;
      yearAgg.totalCost += totalCost;
      yearAgg.ebitda += ebitda;
      yearAgg.cashFlow += cashFlow;
      yearAgg.electricityIncome += electricityIncome;
      yearAgg.certificateIncome += certificateIncome;
      yearAgg.extraServicesIncome += extraServicesIncome;
      yearAgg.subscriptionIncome += subscriptionIncome;
      yearAgg.electricityCost += electricityCost;
      yearAgg.certificateCost += certificateCost;
      yearAgg.salesCost += salesMonth;
      yearAgg.salaryCost += salaryMonth;
      yearAgg.otherExternal += otherExtMonth;
      yearAgg.invoicingCost += invoicingCost;
      yearAgg.loanInterest += loanMonth;
      yearAgg.streamIncome += streamIncome;
      yearAgg.streamCost += streamCost;
      yearAgg.financingIncome += financingIncome;
      yearAgg.financingCost += financingCost;
      yearAgg.financingEndingOutstanding = financingOutstanding;
      for (const sk of STREAM_KEYS) {
        yearAgg.streamsBreakdown[sk].revenue += streamsMonth[sk].revenue;
        yearAgg.streamsBreakdown[sk].cost += streamsMonth[sk].cost;
        yearAgg.streamsBreakdown[sk].endingUnits = streamsMonth[sk].activeUnits;
      }
      for (const k of PRICE_AREAS) {
        yearAgg.volumeByArea[k] += kwhMonth * ya.priceAreaShare[k];
        yearAgg.revenueByArea[k] += monthRevenueByArea[k];
        yearAgg.cogsByArea[k] += monthCogsByArea[k];
      }

      active = endCust;
    }

    yearAgg.endingCustomers = Math.round(active);
    yearAgg.newCustomers = Math.round(yearAgg.newCustomers);
    yearAgg.churnedCustomers = Math.round(yearAgg.churnedCustomers);
    yearly.push(yearAgg);
    runningStart = active;
  }

  return { monthly, yearly };
}

export function kpiForYear(model: ComputedModel, year: number) {
  const y = model.yearly.find((r) => r.year === year) ?? model.yearly[0];
  return {
    customers: y.endingCustomers,
    turnover: y.totalIncome,
    ebitda: y.ebitda,
    cashFlow: y.cashFlow,
    cac: y.cac,
    churn: y.churnRate,
  };
}

export interface ResultRow {
  month: number;
  budget: { customers: number; income: number; cost: number; ebitda: number };
  actual: { customers?: number; income?: number; cost?: number; ebitda?: number };
  variance: { customers?: number; income?: number; cost?: number; ebitda?: number };
}

export interface ResultsSummary {
  rows: ResultRow[];
  ytdBudget: { income: number; cost: number; ebitda: number };
  ytdActual: { income: number; cost: number; ebitda: number };
  latestCustomers?: { month: number; value: number };
}

export function buildResults(model: ComputedModel, actuals: Actuals | undefined, year: number): ResultsSummary {
  const months = model.monthly.filter((m) => m.year === year);
  const map = new Map<number, NonNullable<Actuals>["rows"][number]>();
  for (const r of actuals?.rows ?? []) if (r.year === year) map.set(r.month, r);

  const rows: ResultRow[] = months.map((m) => {
    const a = map.get(m.month);
    const aIncome = a?.totalIncome;
    const aCost = a?.totalCost;
    const aEbitda = aIncome != null && aCost != null ? aIncome - aCost : undefined;
    return {
      month: m.month,
      budget: { customers: m.endingCustomers, income: m.totalIncome, cost: m.totalCost, ebitda: m.ebitda },
      actual: { customers: a?.customers, income: aIncome, cost: aCost, ebitda: aEbitda },
      variance: {
        customers: a?.customers != null ? a.customers - m.endingCustomers : undefined,
        income: aIncome != null ? aIncome - m.totalIncome : undefined,
        cost: aCost != null ? aCost - m.totalCost : undefined,
        ebitda: aEbitda != null ? aEbitda - m.ebitda : undefined,
      },
    };
  });

  const ytdBudget = { income: 0, cost: 0, ebitda: 0 };
  const ytdActual = { income: 0, cost: 0, ebitda: 0 };
  let latestCustomers: ResultsSummary["latestCustomers"];
  for (const r of rows) {
    if (r.actual.income != null) { ytdBudget.income += r.budget.income; ytdActual.income += r.actual.income; }
    if (r.actual.cost != null) { ytdBudget.cost += r.budget.cost; ytdActual.cost += r.actual.cost; }
    if (r.actual.ebitda != null) { ytdBudget.ebitda += r.budget.ebitda; ytdActual.ebitda += r.actual.ebitda; }
    if (r.actual.customers != null) latestCustomers = { month: r.month, value: r.actual.customers };
  }

  return { rows, ytdBudget, ytdActual, latestCustomers };
}

export function buildStatements(model: ComputedModel, a: Assumptions): Statements {
  const taxRate = a.taxRate ?? 0;
  const depYears = Math.max(1, a.depreciationYears ?? 5);
  const dso = a.dso ?? 0;
  const dpo = a.dpo ?? 0;
  const opening = a.opening ?? {
    cash: 0, accountsReceivable: 0, accountsPayable: 0,
    fixedAssets: 0, debt: 0, equity: 0,
  };

  const pnl: PnLRow[] = [];
  const cashFlow: CashFlowRow[] = [];
  const balanceSheet: BalanceSheetRow[] = [];

  let cash = opening.cash;
  let ar = opening.accountsReceivable;
  let ap = opening.accountsPayable;
  let fixedAssets = opening.fixedAssets;
  let debt = opening.debt;
  let equity = opening.equity;

  const monthlyDep = fixedAssets / (depYears * 12);

  for (const m of model.monthly) {
    const revenue = m.totalIncome;
    const cogs = m.electricityCost + m.certificateCost + m.streamCost + m.financingCost;
    const opex = m.invoicingCost + m.salesCost + m.salaryCost + m.otherExternal;
    const ebitda = revenue - cogs - opex;
    const depreciation = Math.max(0, Math.min(monthlyDep, fixedAssets));
    const ebit = ebitda - depreciation;
    const interest = m.loanInterest;
    const ebt = ebit - interest;
    const tax = ebt > 0 ? ebt * taxRate : 0;
    const netIncome = ebt - tax;

    const targetAR = (revenue * 12 * dso) / 365;
    const targetAP = ((cogs + opex) * 12 * dpo) / 365;
    const changeAR = targetAR - ar;
    const changeAP = targetAP - ap;
    ar = targetAR;
    ap = targetAP;

    const cfo = netIncome + depreciation - changeAR + changeAP;
    const capex = 0;
    const cfi = -capex;
    const debtChange = 0;
    const cff = debtChange;
    const netChange = cfo + cfi + cff;

    cash += netChange;
    fixedAssets = Math.max(0, fixedAssets - depreciation) + capex;
    debt += debtChange;
    equity += netIncome;

    pnl.push({
      year: m.year, month: m.month,
      revenue, cogs, grossProfit: revenue - cogs,
      opex, ebitda, depreciation, ebit, interest, ebt, tax, netIncome,
    });
    cashFlow.push({
      year: m.year, month: m.month,
      netIncome, depreciation, changeAR, changeAP, cfo,
      capex, cfi, debtChange, cff, netChange, endingCash: cash,
    });
    const totalAssets = cash + ar + fixedAssets;
    const totalLiabilities = ap + debt;
    const totalLiabEquity = totalLiabilities + equity;
    balanceSheet.push({
      year: m.year, month: m.month,
      cash, accountsReceivable: ar, fixedAssets, totalAssets,
      accountsPayable: ap, debt, totalLiabilities, equity, totalLiabEquity,
      check: totalAssets - totalLiabEquity,
    });
  }

  return { pnl, cashFlow, balanceSheet };
}
