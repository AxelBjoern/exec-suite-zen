// Seed assumptions (zeroed by default; users fill in via the editor).

import type { Assumptions, YearAssumptions, ChannelKey } from "./types";

const zeroChannels = (): Record<ChannelKey, number> => ({
  internet: 0, telephone: 0, print: 0, collaborations: 0,
  tellAFriend: 0, fairs: 0, other: 0,
});

function zeroYear(): YearAssumptions {
  return {
    newCustomersByChannel: zeroChannels(),
    churnRate: 0,
    acquisitionCostPerCustomer: 0,
    subscriptionPerCustomerYear: 0,
    extraServicesPerCustomerYear: 0,
    cogsPct: 0,
    surchargePct: 0,
    otherExternalExpenses: 0,
    socialFeesPct: 0,
    loanInterest: 0,
    invoicingCostPerCustomer: 0,
    salaries: [],
    startingCustomers: 0,
    salesStartMonth: 1,
  };
}

const HORIZON_YEARS = 10;

export const SEED_ASSUMPTIONS: Assumptions = {
  startYear: new Date().getFullYear(),
  years: HORIZON_YEARS,
  vatRate: 0,
  salesAppreciationPct: 0,
  taxRate: 0,
  depreciationYears: 0,
  dso: 0,
  dpo: 0,
  opening: {
    cash: 0, accountsReceivable: 0, accountsPayable: 0,
    fixedAssets: 0, debt: 0, equity: 0,
  },
  financing: {
    enabled: false,
    originationsPerYear: Array.from({ length: HORIZON_YEARS }, () => 0),
    avgPrincipal: 0,
    termMonths: 0,
    customerAPR: 0,
    originationFeePct: 0,
    costOfCapitalPct: 0,
    defaultAnnualPct: 0,
    recoveryPct: 0,
    openingOutstanding: 0,
  },
  perYear: Array.from({ length: HORIZON_YEARS }, () => zeroYear()),
};
