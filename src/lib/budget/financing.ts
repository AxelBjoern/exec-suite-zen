// Financing portfolio engine.

import type {
  Assumptions,
  FinancingAssumptions,
  FinancingMonthRow,
  FinancingResult,
  FinancingYearRow,
} from "./types";

export function defaultFinancing(years: number): FinancingAssumptions {
  return {
    enabled: false,
    originationsPerYear: Array.from({ length: years }, () => 0),
    avgPrincipal: 0,
    termMonths: 120,
    customerAPR: 0,
    originationFeePct: 0,
    costOfCapitalPct: 0,
    defaultAnnualPct: 0,
    recoveryPct: 0,
    openingOutstanding: 0,
  };
}

const emptyMonth = (year: number, month: number, outstanding = 0): FinancingMonthRow => ({
  year, month,
  newOriginations: 0, disbursed: 0, principalRepaid: 0, defaultLoss: 0,
  outstanding, interestIncome: 0, originationFees: 0, costOfFunds: 0,
  netInterestMargin: 0, totalIncome: 0, totalCost: 0,
});

const emptyYear = (year: number): FinancingYearRow => ({
  year,
  newOriginations: 0, disbursed: 0, principalRepaid: 0, defaultLoss: 0,
  endingOutstanding: 0, interestIncome: 0, originationFees: 0, costOfFunds: 0,
  totalIncome: 0, totalCost: 0, netMargin: 0,
});

export function buildFinancing(a: Assumptions): FinancingResult {
  const f = a.financing;
  const monthly: FinancingMonthRow[] = [];
  const yearly: FinancingYearRow[] = [];

  if (!f || !f.enabled) {
    for (let y = 0; y < a.years; y++) {
      const year = a.startYear + y;
      for (let m = 1; m <= 12; m++) monthly.push(emptyMonth(year, m, 0));
      yearly.push(emptyYear(year));
    }
    return { monthly, yearly };
  }

  const term = Math.max(1, f.termMonths);
  let outstanding = f.openingOutstanding ?? 0;

  for (let y = 0; y < a.years; y++) {
    const year = a.startYear + y;
    const originationsThisYear = f.originationsPerYear[y] ?? 0;
    const newPerMonth = originationsThisYear / 12;
    const yAgg = emptyYear(year);

    for (let m = 1; m <= 12; m++) {
      const start = outstanding;
      const disbursed = newPerMonth * f.avgPrincipal;
      const avgBalance = start + disbursed / 2;
      const interestIncome = avgBalance * (f.customerAPR / 12);
      const costOfFunds = avgBalance * (f.costOfCapitalPct / 12);
      const defaultsGross = avgBalance * (f.defaultAnnualPct / 12);
      const defaultLoss = defaultsGross * (1 - f.recoveryPct);
      const originationFees = disbursed * f.originationFeePct;
      const principalRepaid = start / term;

      outstanding = Math.max(0, start + disbursed - principalRepaid - defaultLoss);

      const income = interestIncome + originationFees;
      const cost = costOfFunds + defaultLoss;

      monthly.push({
        year, month: m,
        newOriginations: newPerMonth, disbursed, principalRepaid, defaultLoss,
        outstanding, interestIncome, originationFees, costOfFunds,
        netInterestMargin: interestIncome - costOfFunds,
        totalIncome: income, totalCost: cost,
      });

      yAgg.newOriginations += newPerMonth;
      yAgg.disbursed += disbursed;
      yAgg.principalRepaid += principalRepaid;
      yAgg.defaultLoss += defaultLoss;
      yAgg.interestIncome += interestIncome;
      yAgg.originationFees += originationFees;
      yAgg.costOfFunds += costOfFunds;
      yAgg.totalIncome += income;
      yAgg.totalCost += cost;
    }

    yAgg.endingOutstanding = outstanding;
    yAgg.netMargin = yAgg.totalIncome - yAgg.totalCost;
    yearly.push(yAgg);
  }

  return { monthly, yearly };
}
