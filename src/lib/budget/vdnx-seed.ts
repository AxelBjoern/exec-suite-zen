// VDNX seeded scenarios (currency: AED).
//
// Source of truth: "Instruction — Seed the VDNX budget scenario". Every non-zero number below
// carries a chip: ACTUAL | TARGET | MODEL. Every zero that is genuinely unknown carries
// `// PLACEHOLDER — needs input`. Do not invent numbers here.
//
// Stated peg used for every USD → AED conversion: USD 1 = AED 3.6725.

import type { Assumptions, ChannelKey, ScenarioNote, YearAssumptions } from "./types";

const USD_TO_AED = 3.6725;

/** ACTUAL — canonical price list: Launch AED 299 / mo. */
const LAUNCH_YEAR = 299 * 12; // 3,588
/** ACTUAL — canonical price list: Advisor Platform AED 15,000 / mo per firm. */
const ADVISOR_FIRM_YEAR = 15_000 * 12; // 180,000

const noChannels = (): Record<ChannelKey, number> => ({
  internet: 0, telephone: 0, print: 0, collaborations: 0,
  tellAFriend: 0, fairs: 0, other: 0,
});

function year(opts: {
  startingCustomers?: number;
  collaborations?: number;
  subscriptionPerCustomerYear?: number;
  extraServicesPerCustomerYear?: number;
  salesStartMonth?: number;
}): YearAssumptions {
  return {
    newCustomersByChannel: { ...noChannels(), collaborations: opts.collaborations ?? 0 },
    churnRate: 0, // PLACEHOLDER — needs input. Retention data lands past 90 days of the Norway pilot (target Q3/Q4 2026)
    acquisitionCostPerCustomer: 0, // PLACEHOLDER — needs input
    subscriptionPerCustomerYear: opts.subscriptionPerCustomerYear ?? 0,
    extraServicesPerCustomerYear: opts.extraServicesPerCustomerYear ?? 0,
    cogsPct: 0, // PLACEHOLDER — needs input (hosting + model inference cost not yet measured)
    surchargePct: 0,
    otherExternalExpenses: 0, // PLACEHOLDER — needs input
    socialFeesPct: 0, // PLACEHOLDER — needs input
    loanInterest: 0, // ACTUAL — no debt
    invoicingCostPerCustomer: 0, // PLACEHOLDER — needs input
    salaries: [], // PLACEHOLDER — needs input (round-funded hires; salary amounts not set)
    startingCustomers: opts.startingCustomers ?? 0,
    salesStartMonth: opts.salesStartMonth ?? 1,
  };
}

const VDNX_NOTES: ScenarioNote[] = [
  { chip: "ACTUAL", label: "Current status", detail: "5 live entities (founder network) + CSP pilot in progress — Norway." },
  { chip: "ACTUAL", label: "Entities", detail: "VDNX LTD (UAE, common law, founder company — full operator use); SE-01 Sweden (civil law); UK-01 United Kingdom (common law); AE-02 UAE (common law); NO-01 Norway (civil law, also hosts the Norway CSP pilot). All associated firms: records + authorizations." },
  { chip: "ACTUAL", label: "Related-party revenue", detail: "AED 20,000 — management accounts. Only revenue recognised to date; sits in 2026 and is not double-counted in the subscription line." },
  { chip: "ACTUAL", label: "Jurisdictions", detail: "4 (SE, UK, UAE, NO)." },
  { chip: "TARGET", label: "Round", detail: `USD 1M pre-seed (AED ${(1_000_000 * USD_TO_AED).toLocaleString("en-AE")} @ USD 1 = AED ${USD_TO_AED}). Use of funds: hiring, sales & marketing, certification.` },
  { chip: "TARGET", label: "Milestones funded by the round", detail: "1) First 8 founding-partner firms and 160+ companies on platform (pilot cohort). 2) First named CSP founding-partner deal (Norway pilot cohort). 3) Retention data past 90 days (Norway pilot cohort). 4) UK ECCTA readiness pack scoped with one named partner. 5) Initiate SOC 2 and ISO 27001 certification." },
  { chip: "MODEL", label: "Capacity model", detail: "Advisor capacity moves from ~40 clients to ~120 once onboarding runs through the Submission Pack. Narrative only — never a revenue driver." },
  { chip: "TARGET", label: "Pricing footer", detail: "Pilot cohort — limited seats, grandfathered pricing, product influence." },
  { chip: "TARGET", label: "Framing", detail: "Proof by 2027 · Machine by 2029 · Print by 2031." },
];

function base(perYear: YearAssumptions[]): Assumptions {
  return {
    startYear: 2026,
    years: 6,
    currency: "AED",
    vatRate: 0.05, // ACTUAL — UAE VAT
    taxRate: 0.09, // ACTUAL — UAE corporate tax
    salesAppreciationPct: 0,
    depreciationYears: 0, // PLACEHOLDER — needs input
    dso: 0, // PLACEHOLDER — needs input
    dpo: 0, // PLACEHOLDER — needs input
    opening: {
      // TARGET — round not yet closed; rate USD 1 = AED 3.6725
      cash: 1_000_000 * USD_TO_AED, // 3,672,500
      equity: 1_000_000 * USD_TO_AED, // 3,672,500
      accountsReceivable: 0,
      accountsPayable: 0,
      fixedAssets: 0,
      debt: 0,
    },
    financing: {
      enabled: false, // VDNX does not originate loans — block stays zeroed
      originationsPerYear: Array.from({ length: 6 }, () => 0),
      avgPrincipal: 0, termMonths: 0, customerAPR: 0,
      originationFeePct: 0, costOfCapitalPct: 0,
      defaultAnnualPct: 0, recoveryPct: 0, openingOutstanding: 0,
    },
    employees: [], // PLACEHOLDER — needs input (round-funded hires)
    notes: VDNX_NOTES,
    perYear,
  };
}

// 2027 reconciliation (TARGET):
//   Advisor Platform: 8 × AED 15,000 × 12 = AED 1,440,000
//   Client companies: 160 × AED 299 × 12  = AED   574,080
//   Total                                 = AED 2,014,080 ≈ USD 548K @ 3.6725
// Allocated per client company: subscription 3,588 + extra services 1,440,000 / 160 = 9,000.
const EXTRA_PER_CLIENT_8_FIRMS = (8 * ADVISOR_FIRM_YEAR) / 160; // 9,000 — TARGET

// MODEL — derived from the stated ARR anchors, ending customers = ARR / (3,588 + 9,000):
//   2029 ~USD 3M   → AED 11,017,500 → 875 companies
//   2031 ~USD 100M → AED 367,250,000 → 29,175 companies
//   2028 / 2030 interpolated geometrically (INTERNAL ONLY, not confirmed)
const ARPU = LAUNCH_YEAR + EXTRA_PER_CLIENT_8_FIRMS; // 12,588
const endingFor = (usdArr: number) => Math.round((usdArr * USD_TO_AED) / ARPU);
const END_2027 = 160;                                     // TARGET
const END_2028 = endingFor(1_284_523);                    // MODEL — geometric mid 550K→3M
const END_2029 = endingFor(3_000_000);                    // TARGET
const END_2030 = endingFor(17_320_508);                   // MODEL — geometric mid 3M→100M
const END_2031 = endingFor(100_000_000);                  // TARGET

const growthYear = (from: number, to: number, sub = LAUNCH_YEAR) =>
  year({
    collaborations: Math.max(0, to - from),
    subscriptionPerCustomerYear: sub, // MODEL from 2028 — held at Launch blend; Growth/Scale mix not quantified in source
    extraServicesPerCustomerYear: EXTRA_PER_CLIENT_8_FIRMS,
  });

/** VDNX — Base: deck trajectory, Proof 2027 · Machine 2029 · Print 2031. */
export const VDNX_BASE: Assumptions = base([
  // 2026 — TARGET: first revenue Aug–Dec; 5 live entities (ACTUAL) + founding-partner pilot cohort
  // onboarded so the 160-company base is live for the full 2027 run-rate year.
  year({
    startingCustomers: 5, // ACTUAL — live founder-network entities
    collaborations: END_2027 - 5, // 155 — TARGET (pilot cohort to reach 160)
    subscriptionPerCustomerYear: LAUNCH_YEAR, // ACTUAL price list
    extraServicesPerCustomerYear: EXTRA_PER_CLIENT_8_FIRMS, // TARGET
    salesStartMonth: 8, // TARGET — Aug–Dec 2026 first revenue window
  }),
  // 2027 — TARGET: 160 client companies × Launch + 8 Advisor Platform firms = AED 2,014,080
  year({
    collaborations: 0,
    subscriptionPerCustomerYear: LAUNCH_YEAR,
    extraServicesPerCustomerYear: EXTRA_PER_CLIENT_8_FIRMS,
  }),
  growthYear(END_2027, END_2028), // 2028 — MODEL
  growthYear(END_2028, END_2029), // 2029 — TARGET endpoint
  growthYear(END_2029, END_2030), // 2030 — MODEL
  growthYear(END_2030, END_2031), // 2031 — TARGET endpoint
]);

/** VDNX — Pilot Only: founder network + Norway CSP pilot; 1 Advisor Platform firm from 2027. */
export const VDNX_PILOT_ONLY: Assumptions = base([
  // 2026 — 5 live entities only; no founding-partner cohort conversion.
  year({
    startingCustomers: 5, // ACTUAL
    collaborations: 0, // PLACEHOLDER — needs input (pilot cohort size not stated)
    subscriptionPerCustomerYear: LAUNCH_YEAR, // ACTUAL price list
    extraServicesPerCustomerYear: 0, // PLACEHOLDER — needs input (no advisor firm live in 2026)
    salesStartMonth: 8, // TARGET
  }),
  // 2027 — TARGET: 1 Advisor Platform firm (AED 180,000 / yr) allocated across the 5 live companies.
  year({
    subscriptionPerCustomerYear: LAUNCH_YEAR,
    extraServicesPerCustomerYear: ADVISOR_FIRM_YEAR / 5, // 36,000 — TARGET
  }),
  // 2028–2031 — PLACEHOLDER — needs input (nothing past 2028 is confirmed in this branch)
  year({ subscriptionPerCustomerYear: LAUNCH_YEAR, extraServicesPerCustomerYear: ADVISOR_FIRM_YEAR / 5 }),
  year({ subscriptionPerCustomerYear: LAUNCH_YEAR, extraServicesPerCustomerYear: ADVISOR_FIRM_YEAR / 5 }),
  year({ subscriptionPerCustomerYear: LAUNCH_YEAR, extraServicesPerCustomerYear: ADVISOR_FIRM_YEAR / 5 }),
  year({ subscriptionPerCustomerYear: LAUNCH_YEAR, extraServicesPerCustomerYear: ADVISOR_FIRM_YEAR / 5 }),
]);

/** VDNX — Upside: same price list, faster founding-partner ramp. Volume only, never price. */
export const VDNX_UPSIDE: Assumptions = base([
  year({
    startingCustomers: 5, // ACTUAL
    collaborations: END_2027 - 5, // 155 — TARGET
    subscriptionPerCustomerYear: LAUNCH_YEAR,
    extraServicesPerCustomerYear: EXTRA_PER_CLIENT_8_FIRMS,
    salesStartMonth: 8, // TARGET
  }),
  // 2027 — MODEL: the 2028 cohort lands a year early (volume only).
  growthYear(END_2027, END_2028),
  year({ subscriptionPerCustomerYear: LAUNCH_YEAR, extraServicesPerCustomerYear: EXTRA_PER_CLIENT_8_FIRMS }),
  growthYear(END_2028, END_2029), // 2029 — TARGET endpoint
  growthYear(END_2029, END_2030), // 2030 — MODEL
  growthYear(END_2030, END_2031), // 2031 — TARGET endpoint
]);

export const VDNX_SEED_SCENARIOS: {
  name: string;
  description: string;
  isBase?: boolean;
  assumptions: Assumptions;
}[] = [
  { name: "VDNX — Base", description: "Deck trajectory · AED · Proof 2027 · Machine 2029 · Print 2031", isBase: true, assumptions: VDNX_BASE },
  { name: "VDNX — Pilot Only", description: "Founder network + Norway CSP pilot · AED", assumptions: VDNX_PILOT_ONLY },
  { name: "VDNX — Upside", description: "Faster founding-partner ramp · volume only · AED", assumptions: VDNX_UPSIDE },
];
