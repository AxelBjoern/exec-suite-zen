// Domain types for the generic subscription business budget model.

export type ChannelKey =
  | "internet"
  | "telephone"
  | "print"
  | "collaborations"
  | "tellAFriend"
  | "fairs"
  | "other";

export const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: "internet", label: "Internet" },
  { key: "telephone", label: "Telephone" },
  { key: "print", label: "Print" },
  { key: "collaborations", label: "Collaborations" },
  { key: "tellAFriend", label: "Tell a friend" },
  { key: "fairs", label: "Fairs" },
  { key: "other", label: "Other" },
];

export interface SalaryRole {
  title: string;
  count: number;
  monthlySalary: number;
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
}

/** A scheduled raise: from (year, month) the per-person monthly salary changes. */
export interface SalaryRaise {
  year: number;
  month: number; // 1..12
  monthlySalary: number;
}

/** Scenario-level employee record with a salary timeline. */
export interface Employee {
  id: string;
  name?: string;
  title: string;
  count: number;
  baseMonthlySalary: number;
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  raises: SalaryRaise[];
}


export interface YearAssumptions {
  newCustomersByChannel: Record<ChannelKey, number>;
  churnRate: number;
  acquisitionCostPerCustomer: number;
  subscriptionPerCustomerYear: number;
  extraServicesPerCustomerYear: number;
  /** Direct cost of delivery as a share of revenue (0–1). */
  cogsPct: number;
  surchargePct: number;
  otherExternalExpenses: number;
  socialFeesPct: number;
  loanInterest: number;
  invoicingCostPerCustomer: number;
  salaries: SalaryRole[];
  startingCustomers: number;
  salesStartMonth?: number;
}

export interface OpeningBalance {
  cash: number;
  accountsReceivable: number;
  accountsPayable: number;
  fixedAssets: number;
  debt: number;
  equity: number;
}

export interface Assumptions {
  startYear: number;
  years: number;
  perYear: YearAssumptions[];
  vatRate: number;
  salesAppreciationPct?: number;
  taxRate?: number;
  depreciationYears?: number;
  dso?: number;
  dpo?: number;
  opening?: OpeningBalance;
  financing?: FinancingAssumptions;
}

export interface FinancingAssumptions {
  enabled: boolean;
  originationsPerYear: number[];
  avgPrincipal: number;
  termMonths: number;
  customerAPR: number;
  originationFeePct: number;
  costOfCapitalPct: number;
  defaultAnnualPct: number;
  recoveryPct: number;
  openingOutstanding?: number;
}

export interface FinancingMonthRow {
  year: number;
  month: number;
  newOriginations: number;
  disbursed: number;
  principalRepaid: number;
  defaultLoss: number;
  outstanding: number;
  interestIncome: number;
  originationFees: number;
  costOfFunds: number;
  netInterestMargin: number;
  totalIncome: number;
  totalCost: number;
}

export interface FinancingYearRow {
  year: number;
  newOriginations: number;
  disbursed: number;
  principalRepaid: number;
  defaultLoss: number;
  endingOutstanding: number;
  interestIncome: number;
  originationFees: number;
  costOfFunds: number;
  totalIncome: number;
  totalCost: number;
  netMargin: number;
}

export interface FinancingResult {
  monthly: FinancingMonthRow[];
  yearly: FinancingYearRow[];
}

export interface PnLRow {
  year: number;
  month: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interest: number;
  ebt: number;
  tax: number;
  netIncome: number;
}

export interface CashFlowRow {
  year: number;
  month: number;
  netIncome: number;
  depreciation: number;
  changeAR: number;
  changeAP: number;
  cfo: number;
  capex: number;
  cfi: number;
  debtChange: number;
  cff: number;
  netChange: number;
  endingCash: number;
}

export interface BalanceSheetRow {
  year: number;
  month: number;
  cash: number;
  accountsReceivable: number;
  fixedAssets: number;
  totalAssets: number;
  accountsPayable: number;
  debt: number;
  totalLiabilities: number;
  equity: number;
  totalLiabEquity: number;
  check: number;
}

export interface Statements {
  pnl: PnLRow[];
  cashFlow: CashFlowRow[];
  balanceSheet: BalanceSheetRow[];
}

export interface MonthlyRow {
  year: number;
  month: number;
  startingCustomers: number;
  newCustomers: number;
  churnedCustomers: number;
  endingCustomers: number;
  extraServicesIncome: number;
  subscriptionIncome: number;
  totalIncome: number;
  cogs: number;
  invoicingCost: number;
  salesCost: number;
  salaryCost: number;
  otherExternal: number;
  loanInterest: number;
  totalCost: number;
  financingIncome: number;
  financingCost: number;
  financingOutstanding: number;
  ebitda: number;
  cashFlow: number;
  vatOut: number;
  vatIn: number;
  vatNet: number;
}

export interface YearlyRow {
  year: number;
  startingCustomers: number;
  endingCustomers: number;
  newCustomers: number;
  churnedCustomers: number;
  totalIncome: number;
  totalCost: number;
  ebitda: number;
  cashFlow: number;
  cac: number;
  churnRate: number;
  extraServicesIncome: number;
  subscriptionIncome: number;
  cogs: number;
  salesCost: number;
  salaryCost: number;
  otherExternal: number;
  invoicingCost: number;
  loanInterest: number;
  financingIncome: number;
  financingCost: number;
  financingEndingOutstanding: number;
}

export interface ComputedModel {
  monthly: MonthlyRow[];
  yearly: YearlyRow[];
}

export type ScenarioName = "Base" | "Optimistic" | "Pessimistic";

export interface Scenario {
  id: string;
  name: string;
  createdAt: number;
  assumptions: Assumptions;
  actuals?: Actuals;
  contractStartDate?: string;
  isSystem?: boolean;
  isBase?: boolean;
  isLocked?: boolean;
}

export interface ActualMonth {
  year: number;
  month: number;
  customers?: number;
  totalIncome?: number;
  totalCost?: number;
}

export interface Actuals {
  rows: ActualMonth[];
}
