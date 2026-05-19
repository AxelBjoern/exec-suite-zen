// Helpers for the Monday-board cadence.
// Server-only. Importable from cron routes and server functions.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callTool } from "@/server/llm.server";
import {
  ARTIFACT_TOOL,
  CONSULT_TOOL,
  CHAT_TOOL,
  shouldGate,
  type Artifact,
  type Consult,
  type ChatReply,
} from "@/lib/agent-schemas";
import { buildSystemPrompt, renderCompanyContext } from "@/lib/agent-prompts";

const MAX_DEPTH = 3;

export async function loadContext() {
  const { data: ctxRow } = await supabaseAdmin
    .from("company_context").select("*").limit(1).maybeSingle();
  const { data: recentDecisions } = await supabaseAdmin
    .from("decision_log")
    .select("title, decision, created_at")
    .order("created_at", { ascending: false })
    .limit(6);
  return {
    companyContext: renderCompanyContext(ctxRow),
    recentDecisions: recentDecisions ?? [],
  };
}

function artifactToMarkdown(a: Artifact): string {
  const sections = a.sections.map(s => `### ${s.heading}\n\n${s.body_md}`).join("\n\n");
  const items = a.action_items.length
    ? `\n\n### Action Items\n\n${a.action_items.map((it, i) => `${i + 1}. **${it.task}** — ${it.owner_agent.toUpperCase()} · ${it.deliverable} · due ${it.due}${it.auto_dispatch ? "" : " · gate"}`).join("\n")}`
    : "";
  return `# ${a.title}\n\n${sections}${items}`;
}

function consultMd(c: Consult, role: string) {
  return `**${role} — ${c.position.toUpperCase()}${c.blocking ? " · BLOCKING" : ""}**\n\n${c.rationale}`;
}

/**
 * Run the Monday board meeting: CEO + consults produce a weekly plan,
 * write a `kind=board` thread, and create a parent approval of kind `weekly_plan`.
 */
export async function runMondayBoard() {
  const { data: agents } = await supabaseAdmin.from("agents").select("*");
  const ceo = agents!.find(a => a.slug === "ceo") ?? agents![0];
  const { companyContext, recentDecisions } = await loadContext();

  const { data: thread } = await supabaseAdmin
    .from("threads")
    .insert({
      agent_id: ceo.id,
      mode: "boardroom",
      kind: "board",
      title: `Weekly board — ${new Date().toISOString().slice(0, 10)}`,
    })
    .select().single();

  const userPrompt = `It is Monday. Convene the weekly board meeting. Review last week's outcomes (recent decisions below) and propose the plan for the coming week. Each action item MUST have an explicit owner agent and a due date within the next 7 days. Mark items requiring operator approval (external posts, emails, spend) with auto_dispatch:false.`;

  const ceoSystem = buildSystemPrompt({
    agentSlug: ceo.slug,
    agentRole: ceo.role,
    agentMandate: ceo.mandate,
    agentTone: ceo.tone,
    baseSystemPrompt: ceo.system_prompt,
    directives: [],
    companyContext,
    recentDecisions,
  });

  const { result: artifact } = await callTool<Artifact>({
    system: ceoSystem,
    user: userPrompt,
    tool: ARTIFACT_TOOL,
  });

  await supabaseAdmin.from("messages").insert({
    thread_id: thread!.id,
    agent_id: ceo.id,
    role: "agent",
    content: artifactToMarkdown(artifact),
    artifact_json: artifact as any,
  });

  // Consults
  for (const slug of (ceo.consult_with ?? []) as string[]) {
    const c = agents!.find(a => a.slug === slug);
    if (!c) continue;
    try {
      const consultSystem = buildSystemPrompt({
        agentSlug: c.slug, agentRole: c.role, agentMandate: c.mandate, agentTone: c.tone,
        baseSystemPrompt: c.system_prompt, directives: [], companyContext, recentDecisions,
        consultFor: { primaryRole: ceo.role, primaryReply: artifactToMarkdown(artifact) },
      });
      const cr = await callTool<Consult>({ system: consultSystem, user: userPrompt, tool: CONSULT_TOOL });
      await supabaseAdmin.from("messages").insert({
        thread_id: thread!.id, agent_id: c.id, role: "agent",
        content: consultMd(cr.result, c.role), artifact_json: { kind: "consult", ...cr.result } as any,
      });
    } catch (e: any) {
      await supabaseAdmin.from("messages").insert({
        thread_id: thread!.id, agent_id: c.id, role: "agent",
        content: `*${c.role} unavailable: ${e.message}*`,
      });
    }
  }

  // Parent task (the weekly plan) — blocked on operator approval
  const { data: parent } = await supabaseAdmin.from("tasks").insert({
    agent_id: ceo.id, thread_id: thread!.id, owner_agent: ceo.slug,
    title: artifact.title.slice(0, 200),
    body: "Weekly plan awaiting operator approval.",
    status: "blocked", requires_approval: true, kind: "plan_item", depth: 0,
    payload: { artifact } as any,
  }).select().single();

  // Child tasks (blocked until weekly plan is approved)
  const childIds: string[] = [];
  for (const item of artifact.action_items ?? []) {
    const owner = agents!.find(a => a.slug === item.owner_agent);
    if (!owner) continue;
    const externalGate = !item.auto_dispatch || shouldGate(item.task, item.deliverable);
    const { data: child } = await supabaseAdmin.from("tasks").insert({
      agent_id: owner.id, thread_id: thread!.id, parent_task_id: parent?.id ?? null,
      owner_agent: owner.slug,
      title: item.task.slice(0, 200),
      body: `${item.deliverable}\n\nDue: ${item.due}`,
      status: "blocked", requires_approval: externalGate, auto_dispatched: !externalGate,
      kind: "plan_item", depth: 1,
      payload: { item } as any,
    }).select().single();
    if (child) childIds.push(child.id);
  }

  // Parent approval row of kind weekly_plan
  await supabaseAdmin.from("approvals").insert({
    task_id: parent?.id ?? null, status: "pending", kind: "weekly_plan",
    payload: { thread_id: thread!.id, child_task_ids: childIds } as any,
  });

  return { thread_id: thread!.id, plan_task_id: parent?.id, child_task_ids: childIds };
}

/**
 * Approve the weekly plan: flip children to todo and enqueue auto-dispatch ones.
 */
export async function approveWeeklyPlan(approval_id: string) {
  const { data: appr } = await supabaseAdmin
    .from("approvals").select("*").eq("id", approval_id).single();
  if (!appr || appr.kind !== "weekly_plan") throw new Error("not a weekly_plan approval");

  await supabaseAdmin.from("approvals").update({
    status: "approved", decided_at: new Date().toISOString(), reviewer: "operator",
  }).eq("id", approval_id);

  const childIds: string[] = (appr.payload as any)?.child_task_ids ?? [];
  if (!childIds.length) return { ok: true, dispatched: 0 };

  const { data: children } = await supabaseAdmin
    .from("tasks").select("*").in("id", childIds);

  let dispatched = 0;
  for (const t of children ?? []) {
    if (t.auto_dispatched) {
      await supabaseAdmin.from("tasks").update({ status: "todo" }).eq("id", t.id);
      await supabaseAdmin.from("job_queue").insert({
        kind: "run_task",
        payload: { task_id: t.id } as any,
        run_at: new Date().toISOString(),
      });
      dispatched++;
    } else {
      // External — keep blocked; ensure per-task approval row exists
      const { data: existing } = await supabaseAdmin
        .from("approvals").select("id").eq("task_id", t.id).maybeSingle();
      if (!existing) {
        await supabaseAdmin.from("approvals").insert({
          task_id: t.id, status: "pending", kind: "task",
        });
      }
    }
  }
  if (appr.task_id) {
    await supabaseAdmin.from("tasks").update({
      status: "done", approved_by: "operator", approved_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", appr.task_id);
  }
  return { ok: true, dispatched };
}

/** Run a single child task: send its body as a freeform prompt to its owner agent. */
export async function runTask(task_id: string) {
  const { data: t } = await supabaseAdmin
    .from("tasks").select("*, agents(*)").eq("id", task_id).single();
  if (!t) throw new Error(`task ${task_id} not found`);
  if ((t.depth ?? 0) >= MAX_DEPTH) {
    await supabaseAdmin.from("tasks").update({ status: "blocked" }).eq("id", task_id);
    return { ok: false, reason: "max depth" };
  }
  const agent: any = (t as any).agents;
  if (!agent) throw new Error("task has no agent");

  const { companyContext, recentDecisions } = await loadContext();
  const system = buildSystemPrompt({
    agentSlug: agent.slug, agentRole: agent.role, agentMandate: agent.mandate, agentTone: agent.tone,
    baseSystemPrompt: agent.system_prompt, directives: [], companyContext, recentDecisions, freeform: true,
  });

  await supabaseAdmin.from("tasks").update({ status: "in_progress" as any }).eq("id", task_id);

  try {
    const r = await callTool<any>({
      system,
      user: `Execute this task and produce the deliverable.\n\n${t.title}\n\n${t.body ?? ""}`,
      tools: [CHAT_TOOL, ARTIFACT_TOOL],
      toolChoice: "auto",
    });

    const md = r.name === "chat_reply"
      ? (r.result as ChatReply).reply_markdown
      : artifactToMarkdown(r.result as Artifact);

    if (t.thread_id) {
      await supabaseAdmin.from("messages").insert({
        thread_id: t.thread_id, agent_id: agent.id, role: "agent",
        content: md, artifact_json: r.result as any,
      });
    }

    await supabaseAdmin.from("tasks").update({
      status: "done", completed_at: new Date().toISOString(),
    }).eq("id", task_id);

    return { ok: true };
  } catch (e: any) {
    await supabaseAdmin.from("tasks").update({ status: "blocked" }).eq("id", task_id);
    throw e;
  }
}
