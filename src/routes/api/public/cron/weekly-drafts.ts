// Cron: weekly LinkedIn-style draft generation. Mon 07:00 UTC.
// Uses callAgentTool with DeepSeek V4 Pro to produce N drafts per outbound agent.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkCronAuth } from "@/server/cron-auth.server";
import { callAgentTool } from "@/server/agent-tool-runner.server";
import { buildSystemPrompt, renderCompanyContext } from "@/lib/agent-prompts";

const OUTBOUND_SLUGS = ["linkedin", "social", "cmo"];
const DRAFTS_PER_AGENT = 3;

export const Route = createFileRoute("/api/public/cron/weekly-drafts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkCronAuth(request);
        if (auth) return auth;

        const { data: agents } = await supabaseAdmin
          .from("agents")
          .select("*")
          .in("slug", OUTBOUND_SLUGS);

        const { data: ctxRow } = await supabaseAdmin.from("company_context").select("*").limit(1).maybeSingle();
        const { data: recentDecisions } = await supabaseAdmin
          .from("decision_log").select("title, decision, created_at")
          .order("created_at", { ascending: false }).limit(6);
        const companyContext = renderCompanyContext(ctxRow);

        const results: any[] = [];
        for (const agent of agents ?? []) {
          // Dedup: skip if we already generated >= DRAFTS_PER_AGENT drafts in last 24h.
          const since = new Date(Date.now() - 24 * 3600_000).toISOString();
          const { count } = await supabaseAdmin
            .from("content_drafts")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", agent.id)
            .gte("created_at", since);
          if ((count ?? 0) >= DRAFTS_PER_AGENT) {
            results.push({ agent: agent.slug, skipped: true, reason: "already drafted today" });
            continue;
          }

          const system = buildSystemPrompt({
            agentSlug: agent.slug, agentRole: agent.role, agentMandate: agent.mandate, agentTone: agent.tone,
            baseSystemPrompt: agent.system_prompt, directives: [], companyContext, recentDecisions: recentDecisions ?? [],
            freeform: true,
          });
          const user =
            `Generate ${DRAFTS_PER_AGENT} LinkedIn post drafts for this week. ` +
            `For each draft, call the tool 'outbound.draft_linkedin' with a complete body_md ` +
            `(150–250 words, hook + insight + soft CTA). Use 'web.search' if you need a recent ` +
            `industry angle. When done, reply with the final tool envelope.`;

          try {
            const out = await callAgentTool({
              agent_slug: agent.slug,
              system,
              user,
              tools_to_use: ["web.search", "web.fetch", "knowledge.list_docs", "knowledge.read_doc", "outbound.draft_linkedin"],
              max_turns: 8,
            });
            results.push({ agent: agent.slug, ok: true, calls: out.toolCalls.length, model: out.model });
          } catch (e: any) {
            results.push({ agent: agent.slug, ok: false, error: e?.message });
          }
        }
        return Response.json({ ok: true, results });
      },
    },
  },
});
