import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callTool } from "@/server/llm.server";
import { CHAT_TOOL, type ChatReply } from "@/lib/agent-schemas";
import { buildSystemPrompt } from "@/lib/agent-prompts";
import { loadContext } from "@/server/cadence.server";
import { checkCronAuth } from "@/server/cron-auth.server";

export const Route = createFileRoute("/api/public/cron/daily-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkCronAuth(request);
        if (auth) return auth;

        const { data: agents } = await supabaseAdmin.from("agents").select("*").order("sort_order");
        if (!agents?.length) return Response.json({ ok: true, reports: 0 });

        const { companyContext, recentDecisions } = await loadContext();
        const reports: any[] = [];
        const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);

        for (const a of agents) {
          // Dedup: skip if a standup thread already exists today for this agent
          const { data: existing } = await supabaseAdmin
            .from("threads")
            .select("id")
            .eq("agent_id", a.id)
            .eq("kind", "standup")
            .gte("created_at", todayStart.toISOString())
            .limit(1)
            .maybeSingle();
          if (existing) {
            reports.push({ agent: a.slug, ok: true, skipped: "already-ran-today" });
            continue;
          }

          // Pull this agent's open tasks for context
          const { data: openTasks } = await supabaseAdmin
            .from("tasks").select("title,status,completed_at")
            .eq("agent_id", a.id)
            .in("status", ["todo", "in_progress", "blocked", "done"])
            .order("created_at", { ascending: false })
            .limit(10);

          const { data: thread } = await supabaseAdmin.from("threads").insert({
            agent_id: a.id, mode: "solo", kind: "standup",
            title: `${a.role} standup — ${new Date().toISOString().slice(0, 10)}`,
          }).select().single();

          const system = buildSystemPrompt({
            agentSlug: a.slug, agentRole: a.role, agentMandate: a.mandate, agentTone: a.tone,
            baseSystemPrompt: a.system_prompt, directives: [], companyContext, recentDecisions, freeform: true,
          });
          const user = `Daily standup. Briefly report (1) what you completed since yesterday, (2) what you are working on today, (3) any blockers, and (4) suggestions for the operator. Be concise — under 200 words.\n\nYour recent tasks:\n${(openTasks ?? []).map(t => `- [${t.status}] ${t.title}`).join("\n") || "(none)"}`;

          try {
            const r = await callTool<ChatReply>({ system, user, tool: CHAT_TOOL });
            await supabaseAdmin.from("messages").insert({
              thread_id: thread!.id, agent_id: a.id, role: "agent",
              content: r.result.reply_markdown, artifact_json: { kind: "standup", ...r.result } as any,
            });
            // Heuristic: if reply mentions "suggest" or "recommend", surface as suggestion strip
            if (/suggest|recommend|propose/i.test(r.result.reply_markdown)) {
              await supabaseAdmin.from("suggestions").insert({
                agent_slug: a.slug, thread_id: thread!.id,
                title: `${a.role} standup`,
                body: r.result.reply_markdown.slice(0, 1000),
                status: "pending",
              });
            }
            reports.push({ agent: a.slug, ok: true });
          } catch (e: any) {
            reports.push({ agent: a.slug, ok: false, error: e.message });
          }
        }
        return Response.json({ ok: true, reports });
      },
    },
  },
});
