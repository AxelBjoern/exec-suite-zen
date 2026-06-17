// Static override manifest for VDNX wizard routes. The discovery server
// fn (src/lib/vdnx-wizard-discovery.functions.ts) merges these in on top
// of whatever it auto-discovers from the VDNX repo, so anything that
// auto-discovery misses can be hand-tagged here.
//
// `marker` is a string the probe scans the rendered HTML for; if found,
// wizard_loaded='true'. Leave null when no reliable marker is known yet.

export type WizardRouteOverride = {
  wizard: string;
  route: string;
  marker?: string | null;
  source?: string;
};

export const VDNX_WIZARD_ROUTE_OVERRIDES: WizardRouteOverride[] = [
  // Examples — replace/extend as needed:
  // { wizard: "ShareIssueWizardDialog", route: "/shares", marker: "data-wizard=\"share-issue\"" },
  // { wizard: "ClientOnboardingWizard", route: "/onboarding", marker: "Client Onboarding" },
];
