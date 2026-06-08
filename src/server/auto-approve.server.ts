// Pure rules-based auto-approval helper. No LLM.
// Loaded by approval-sweeper cron.

import type { Tables } from "@/integrations/supabase/types";

type Approval = Tables<"approvals">;
type Rule = Tables<"auto_approve_rules">;

const HARD_DENY_KINDS = new Set(["weekly_plan", "task"]);
const ALLOWED_KINDS = new Set(["reminder", "content_draft", "lead_reply"]);

export type AutoApproveDecision = { approve: boolean; reason: string };

export function shouldAutoApprove(
  approval: Approval,
  rules: Rule[],
  body: string,
): AutoApproveDecision {
  if (HARD_DENY_KINDS.has(approval.kind)) {
    return { approve: false, reason: `kind '${approval.kind}' requires manual review` };
  }
  if (!ALLOWED_KINDS.has(approval.kind)) {
    return { approve: false, reason: `kind '${approval.kind}' not eligible` };
  }
  const payload = (approval.payload ?? {}) as Record<string, any>;
  if (payload.requires_external_approval === true) {
    return { approve: false, reason: "external approval required by payload" };
  }
  const slug = payload.agent_slug as string | undefined;

  const candidates = rules.filter(r =>
    r.enabled &&
    r.kind === approval.kind &&
    (r.agent_slug == null || r.agent_slug === slug),
  );
  if (candidates.length === 0) return { approve: false, reason: "no matching enabled rule" };

  const text = (body ?? "").toLowerCase();
  for (const rule of candidates) {
    const m = (rule.match ?? {}) as Record<string, any>;
    const deny: string[] = Array.isArray(m.keyword_deny) ? m.keyword_deny : [];
    const denied = deny.find(k => typeof k === "string" && k.length > 0 && text.includes(k.toLowerCase()));
    if (denied) continue;
    const maxLinks = typeof m.max_external_links === "number" ? m.max_external_links : null;
    if (maxLinks !== null) {
      const linkCount = (body.match(/https?:\/\//gi) ?? []).length;
      if (linkCount > maxLinks) continue;
    }
    return { approve: true, reason: `matched rule ${rule.id}` };
  }
  return { approve: false, reason: "no rule passed safety checks" };
}
