// Seed assumptions (zeroed by default; users fill in via the editor).

import type { Assumptions, YearAssumptions, ChannelKey, StreamKey, StreamAssumptions } from "./types";

function zeroStream(): StreamAssumptions {
  return {
    enabled: false,
    newUnitsPerYear: 0,
    oneTimeRevenuePerUnit: 0,
    oneTimeCogsPct: 0,
    recurringMonthlyPerUnit: 0,
    recurringCogsPct: 0,
    annualChurnPct: 0,
    startingUnits: 0,
  };
}

function zeroStreams(): Record<StreamKey, StreamAssumptions> {
  return {
    solar: zeroStream(),
    battery: zeroStream(),
    vpp: zeroStream(),
    saas: zeroStream(),
  };
}

const zeroChannels = (): Record<ChannelKey, number> => ({
  internet: 0, telephone: 0, print: 0, collaborations: 0,
  tellAFriend: 0, fairs: 0, other: 0,
});

function zeroYear(): YearAssumptions {
  return {
    newCustomersByChannel: zeroChannels(),
    churnRate: 0,
    acquisitionCostPerCustomer: 0,
    kwhPerCustomerYear: 0,
    subscriptionPerCustomerYear: 0,
    pricePerKwh: 0,
    costPerKwh: 0,
    certificateCostPerKwh: 0,
    surchargePct: 0,
    extraServicesPerCustomerYear: 0,
    otherExternalExpenses: 0,
    socialFeesPct: 0,
    loanInterest: 0,
    invoicingCostPerCustomer: 0,
    salaries: [],
    priceAreaShare: { SE1: 0, SE2: 0, SE3: 0, SE4: 0 },
    startingCustomers: 0,
    priceAreaPricing: {
      SE1: { avgPurchaseOre: 0, pslagOre: 0, elcertOre: 0 },
      SE2: { avgPurchaseOre: 0, pslagOre: 0, elcertOre: 0 },
      SE3: { avgPurchaseOre: 0, pslagOre: 0, elcertOre: 0 },
      SE4: { avgPurchaseOre: 0, pslagOre: 0, elcertOre: 0 },
    },
    useAreaPricing: false,
    streams: zeroStreams(),
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
