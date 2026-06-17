// Static override manifest for VDNX wizard routes. The discovery server
// fn (src/lib/vdnx-wizard-discovery.functions.ts) prefers these over its
// GitHub auto-search, which misses wizards that are imported transitively
// rather than directly in the route file.
//
// Routes derived from VDNX's src/App.tsx + page-level Routes (react-router).
// Last cross-checked: 2026-06-17.

export type WizardRouteOverride = {
  wizard: string;
  route: string;
  marker?: string | null;
  source?: string;
};

export const VDNX_WIZARD_ROUTE_OVERRIDES: WizardRouteOverride[] = [
  // Shares wizards — all mounted via VdnxIssuancesPage or NewEventsModal.
  { wizard: "ShareIssueWizardDialog", route: "/vdnx-shares/issuances", marker: "Issuances", source: "VdnxIssuancesPage" },
  { wizard: "ShareTransferWizardDialog", route: "/vdnx-shares/share-ledger-events", marker: "Ledger", source: "NewEventsModal" },
  { wizard: "AdvancedTransferWizardDialog", route: "/vdnx-shares/share-ledger-events", marker: "Ledger", source: "NewEventsModal" },
  { wizard: "SharePledgeWizardDialog", route: "/vdnx-shares/share-ledger-events", marker: "Ledger", source: "NewEventsModal" },
  { wizard: "ShareSplitWizardDialog", route: "/vdnx-shares/share-ledger-events", marker: "Ledger", source: "NewEventsModal" },
  { wizard: "ReverseSplitWizardDialog", route: "/vdnx-shares/share-ledger-events", marker: "Ledger", source: "NewEventsModal" },
  // Contract wizard — mounted in the Contracts tab on AdminUserListPage.
  { wizard: "ContractWizardShell", route: "/admin/users", marker: "Users", source: "AdminContractsTab" },
  // Public onboarding wizard — token-gated; probe just confirms route loads.
  { wizard: "ClientOnboardingWizard", route: "/client-onboarding/probe-test", marker: null, source: "ClientOnboardingPage (token route)" },
  // User creation — mounted on VdnxAdminUsersPage via UnifiedUserManagementPage.
  { wizard: "UserCreationWizard", route: "/vdnx-admin-apps/users", marker: "Users", source: "VdnxAdminUsersPage" },
];
