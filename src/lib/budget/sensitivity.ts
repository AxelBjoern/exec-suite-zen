// Sensitivity / tornado analysis.

import { compute } from "./engine";
import type { Assumptions, ComputedModel, YearAssumptions } from "./types";

export type DriverKey =
  | "subscriptionPerCustomer"
  | "extraServicesPerCustomer"
  | "cogsPct"
  | "churnRate"
  | "newCustomersVolume"
  | "acquisitionCost"
  | "salaryCost"
  | "salesAppreciation"
  | "financingAPR"
  | "financingOriginations";

export interface DriverDef {
  key: DriverKey;
  label: string;
  group: "Pricing" | "Volume" | "Costs" | "Financing";
  description: string;
}

export const DRIVERS: DriverDef[] = [
  { key: "subscriptionPerCustomer", label: "Subscription fee", group: "Pricing", description: "Annual subscription per customer" },
  { key: "extraServicesPerCustomer", label: "Extra services", group: "Pricing", description: "Annual extra services revenue per customer" },
  { key: "salesAppreciation", label: "Sales appreciation", group: "Pricing", description: "Year-on-year price escalation" },
  { key: "newCustomersVolume", label: "New customer volume", group: "Volume", description: "Acquired customers / year" },
  { key: "churnRate", label: "Churn rate", group: "Volume", description: "Annual customer churn" },
  { key: "cogsPct", label: "COGS %", group: "Costs", description: "Direct cost as a share of revenue" },
  { key: "acquisitionCost", label: "Acquisition cost", group: "Costs", description: "Sales cost per acquired customer" },
  { key: "salaryCost", label: "Salary cost", group: "Costs", description: "Personnel cost" },
  { key: "financingAPR", label: "Financing APR", group: "Financing", description: "Customer interest rate" },
  { key: "financingOriginations", label: "Financing originations", group: "Financing", description: "New loans/leases per year" },
];

function applyDriver(a: Assumptions, key: DriverKey, factor: number): Assumptions {
  const next: Assumptions = structuredClone(a);
  const mut = (fn: (y: YearAssumptions) => void) => next.perYear.forEach(fn);

  switch (key) {
    case "subscriptionPerCustomer": mut((y) => { y.subscriptionPerCustomerYear *= factor; }); break;
    case "extraServicesPerCustomer": mut((y) => { y.extraServicesPerCustomerYear *= factor; }); break;
    case "cogsPct": mut((y) => { y.cogsPct = Math.min(1, Math.max(0, (y.cogsPct ?? 0) * factor)); }); break;
    case "salesAppreciation": next.salesAppreciationPct = (next.salesAppreciationPct ?? 0) * factor; break;
    case "newCustomersVolume":
      mut((y) => {
        for (const k of Object.keys(y.newCustomersByChannel) as Array<keyof typeof y.newCustomersByChannel>) {
          y.newCustomersByChannel[k] = Math.round(y.newCustomersByChannel[k] * factor);
        }
      });
      break;
    case "churnRate": mut((y) => { y.churnRate = Math.min(0.99, Math.max(0, y.churnRate * factor)); }); break;
    case "acquisitionCost": mut((y) => { y.acquisitionCostPerCustomer *= factor; }); break;
    case "salaryCost":
      mut((y) => { y.salaries = y.salaries.map((r) => ({ ...r, monthlySalary: r.monthlySalary * factor })); });
      break;
    case "financingAPR": if (next.financing) next.financing.customerAPR *= factor; break;
    case "financingOriginations":
      if (next.financing) {
        next.financing.originationsPerYear = next.financing.originationsPerYear.map((o) => Math.round(o * factor));
      }
      break;
  }
  return next;
}

function totalEbitda(m: ComputedModel): number {
  return m.yearly.reduce((a, y) => a + y.ebitda, 0);
}

export interface SensitivityRow {
  key: DriverKey;
  label: string;
  group: DriverDef["group"];
  base: number;
  low: number;
  high: number;
  lowDelta: number;
  highDelta: number;
  spread: number;
}

export interface SensitivityResult {
  baseEbitda: number;
  deltaPct: number;
  rows: SensitivityRow[];
}

export function buildSensitivity(a: Assumptions, deltaPct = 0.1): SensitivityResult {
  const base = totalEbitda(compute(a));
  const rows: SensitivityRow[] = DRIVERS.map((d) => {
    const low = totalEbitda(compute(applyDriver(a, d.key, 1 - deltaPct)));
    const high = totalEbitda(compute(applyDriver(a, d.key, 1 + deltaPct)));
    const lowDelta = low - base;
    const highDelta = high - base;
    return {
      key: d.key, label: d.label, group: d.group, base, low, high,
      lowDelta, highDelta, spread: Math.abs(highDelta - lowDelta),
    };
  }).sort((a, b) => b.spread - a.spread);

  return { baseEbitda: base, deltaPct, rows };
}
