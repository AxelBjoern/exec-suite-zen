// Owner-gated server fn that discovers VDNX wizard routes from the VDNX
// repo via the existing READ-ONLY GitHub helpers. Returns one entry per
// known wizard component with a best-guess host route, plus a list of
// unresolved wizards so we can see gaps instead of probing wrong URLs.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VDNX_WIZARD_ROUTE_OVERRIDES } from "@/lib/vdnx-wizard-routes";

const KNOWN_WIZARDS: Array<{ wizard: string; component_path_hint: string; marker?: string }> = [
  { wizard: "ShareIssueWizardDialog", component_path_hint: "shares-wizards/share-issue", marker: "ShareIssueWizardDialog" },
  { wizard: "ShareTransferWizardDialog", component_path_hint: "shares-wizards/share-transfer", marker: "ShareTransferWizardDialog" },
  { wizard: "AdvancedTransferWizardDialog", component_path_hint: "shares-wizards/advanced-transfer", marker: "AdvancedTransferWizardDialog" },
  { wizard: "SharePledgeWizardDialog", component_path_hint: "shares-wizards/share-pledge", marker: "SharePledgeWizardDialog" },
  { wizard: "ShareSplitWizardDialog", component_path_hint: "shares-wizards/share-split", marker: "ShareSplitWizardDialog" },
  { wizard: "ReverseSplitWizardDialog", component_path_hint: "shares-wizards/reverse-split", marker: "ReverseSplitWizardDialog" },
  { wizard: "ContractWizardShell", component_path_hint: "admin/contracts/ContractWizardShell", marker: "ContractWizardShell" },
  { wizard: "ClientOnboardingWizard", component_path_hint: "onboarding/", marker: "Client Onboarding" },
  { wizard: "UserCreationWizard", component_path_hint: "user-management/components/UserCreationWizard", marker: "UserCreationWizard" },
];

export type DiscoveredWizardRoute = {
  wizard: string;
  route: string | null;
  marker: string | null;
  source_file: string | null;
  via: "override" | "search" | "unresolved";
};

export const discoverVdnxWizardRoutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Owner-only
    const { data: roles, error: rolesErr } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesErr) throw new Error(rolesErr.message);
    const isOwner = (roles ?? []).some((r: any) => r.role === "owner");
    if (!isOwner) throw new Error("Forbidden: owner role required");

    // Build override map keyed by wizard name
    const overrides = new Map<string, DiscoveredWizardRoute>();
    for (const o of VDNX_WIZARD_ROUTE_OVERRIDES) {
      overrides.set(o.wizard, {
        wizard: o.wizard,
        route: o.route,
        marker: o.marker ?? null,
        source_file: o.source ?? "override",
        via: "override",
      });
    }

    const { searchRepoCode } = await import("@/lib/github.server");
    const results: DiscoveredWizardRoute[] = [];

    for (const w of KNOWN_WIZARDS) {
      if (overrides.has(w.wizard)) {
        results.push(overrides.get(w.wizard)!);
        continue;
      }
      try {
        // Find where this wizard is imported — that file's route path is our best guess.
        const hits = await searchRepoCode(`import ${w.wizard}`);
        const importer = hits.matches.find((m) => /src\/routes\//.test(m.path)) ?? hits.matches[0] ?? null;
        if (importer) {
          // Convert `src/routes/_authenticated/shares.tsx` → `/shares`
          const route = importer.path
            .replace(/^.*src\/routes\//, "/")
            .replace(/\/_authenticated/g, "")
            .replace(/\.(tsx?|jsx?)$/, "")
            .replace(/\/index$/, "")
            .replace(/\/+/g, "/") || "/";
          results.push({
            wizard: w.wizard,
            route,
            marker: w.marker ?? null,
            source_file: importer.path,
            via: "search",
          });
        } else {
          results.push({ wizard: w.wizard, route: null, marker: w.marker ?? null, source_file: null, via: "unresolved" });
        }
      } catch (e: any) {
        results.push({
          wizard: w.wizard, route: null, marker: w.marker ?? null,
          source_file: `error: ${e?.message ?? String(e)}`, via: "unresolved",
        });
      }
    }

    return {
      discovered: results,
      probe_routes: results.filter((r) => r.route).map((r) => ({
        wizard: r.wizard, route: r.route!, marker: r.marker,
      })),
      unresolved_count: results.filter((r) => !r.route).length,
    };
  });
