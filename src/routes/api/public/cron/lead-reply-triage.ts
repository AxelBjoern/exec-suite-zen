// Cron: lead-reply triage. Every 10 min.
// For lead_replies with NULL classification, LLM writes classification +
// draft_response (via db.draft_lead_reply tool, which also creates approval).

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkCronAuth } from "@/server/cron-auth.server";
import { callAgentTool } from "@/server/agent-tool-runner.server";
import { buildSystemPrompt, renderCompanyContext } from "@/lib/agent-prompts";

const TRIAGE_AGENT_SLUG = "sales";
const BATCH = 5;

export const Route = createFileRoute("/api/public/cron/lead-reply-triage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkCronAuth(request);
        if (auth) return auth;

        const { data: pending } = await supabaseAdmin
          .from("lead_replies")
          .select("id, body, lead_id, created_at")
          .is("classification", null)
          .order("created_at", { ascending: true })
          .limit(BATCH);

        if (!pending?.length) return Response.json({ ok: true, processed: 0 });

        const { data: agent } = await supabaseAdmin
          .from("agents").select("*").eq("slug", TRIAGE_AGENT_SLUG).maybeSingle();
        if (!agent) return Response.json({ ok: false, error: "triage agent not found" }, { status: 500 });

        const { data: ctxRow } = await supabaseAdmin.from("company_context").select("*").limit(1).maybeSingle();
        const companyContext = renderCompanyContext(ctxRow);
        const system = buildSystemPrompt({
          agentSlug: agent.slug, agentRole: agent.role, agentMandate: agent.mandate, agentTone: agent.tone,
          baseSystemPrompt: agent.system_prompt, directives: [], companyContext, recentDecisions: [], freeform: true,
        });

        const results: any[] = [];
        for (const reply of pending) {
          const user =
            `Triage this inbound lead reply. Call db.draft_lead_reply with:\n` +
            `  reply_id: ${reply.id}\n` +
            `  classification: one of positive | neutral | objection | spam | unsubscribe | other\n` +
            `  draft_response: a short, on-brand reply (1–3 short paragraphs).\n\n` +
            `Reply body:\n"""\n${(reply.body ?? "").slice(0, 4000)}\n"""`;
          try {
            const out = await callAgentTool({
              agent_slug: agent.slug,
              system,
              user,
              tools_to_use: ["db.draft_lead_reply"],
              max_turns: 3,
            });
            results.push({ reply_id: reply.id, ok: true, calls: out.toolCalls.length });
          } catch (e: any) {
            results.push({ reply_id: reply.id, ok: false, error: e?.message });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
