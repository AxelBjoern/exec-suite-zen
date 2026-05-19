import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";
import {
  ARTIFACT_TOOL,
  CONSULT_TOOL,
  CHAT_TOOL,
  ROUTE_TOOL,
  type Artifact,
  type Consult,
  type ChatReply,
  type RouteDecision,
  shouldGate,
  INTERNAL_VERBS,
} from "@/lib/agent-schemas";
import { buildSystemPrompt, buildRouterPrompt, renderCompanyContext, DEFAULT_COMPANY_CONTEXT } from "@/lib/agent-prompts";
import { callTool } from "@/server/llm.server";

function sha(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

async function appendAudit(args: {
  actor?: string;
  agent_slug?: string | null;
  action: string;
  target?: string | null;
  payload?: any;
}) {
  const { data: last } = await supabaseAdmin
    .from("audit_log")
    .select("hash_self")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prev_hash = last?.hash_self ?? null;
  const canonical = JSON.stringify({
    actor: args.actor ?? "operator",
    agent_slug: args.agent_slug ?? null,
    action: args.action,
    target: args.target ?? null,
    payload: args.payload ?? {},
    prev_hash,
    ts: new Date().toISOString(),
  });
  const hash_self = sha((prev_hash ?? "") + canonical);
  const { data, error } = await supabaseAdmin
    .from("audit_log")
    .insert({
      actor: args.actor ?? "operator",
      agent_slug: args.agent_slug ?? null,
      action: args.action,
      target: args.target ?? null,
      payload: args.payload ?? {},
      prev_hash,
      hash_self,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export const listAgents = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data;
});

export const getThread = createServerFn({ method: "GET" })
  .inputValidator((d: { thread_id: string }) => d)
  .handler(async ({ data }) => {
    const { data: thread } = await supabaseAdmin
      .from("threads")
      .select("*")
      .eq("id", data.thread_id)
      .single();
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("thread_id", data.thread_id)
      .order("created_at");
    return { thread, messages: messages ?? [] };
  });

export const listAudit = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("audit_log")
    .select("*")
    .order("id", { ascending: false })
    .limit(100);
  return data ?? [];
});

export const listTasks = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("tasks")
    .select("*, agents(slug,name)")
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
});

export const listApprovals = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("approvals")
    .select("*, tasks(*, agents(slug,name))")
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
});

export const decideApproval = createServerFn({ method: "POST" })
  .inputValidator((d: { approval_id: string; decision: "approved" | "rejected"; notes?: string }) => d)
  .handler(async ({ data }) => {
    const { data: appr } = await supabaseAdmin
      .from("approvals")
      .update({
        status: data.decision,
        decided_at: new Date().toISOString(),
        reviewer: "operator",
        notes: data.notes ?? null,
      })
      .eq("id", data.approval_id)
      .select("*, tasks(*)")
      .single();
    let externalResult: any = null;
    if (appr?.task_id && data.decision === "approved") {
      const task: any = (appr as any).tasks;
      const payload = task?.payload;
      if (payload?.kind === "email") {
        try {
          const apiKey = process.env.RESEND_API_KEY;
          if (!apiKey) throw new Error("RESEND_API_KEY not configured. Add it in Lovable Cloud → Secrets.");
          const from = payload.from ?? process.env.RESEND_FROM ?? "VDNX <onboarding@resend.dev>";
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from, to: [payload.to], subject: payload.subject,
              html: payload.html ?? undefined, text: payload.text ?? undefined,
            }),
          });
          const body = await res.json().catch(() => ({}));
          await supabaseAdmin.from("tool_calls").insert({
            task_id: task.id, agent_slug: task.owner_agent, tool: "email.send",
            request: { ...payload, from }, response: body,
            status: res.ok ? "ok" : "error",
            error: res.ok ? null : `Resend ${res.status}`,
          });
          if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
          externalResult = { sent: true, id: (body as any).id };
        } catch (e: any) {
          externalResult = { sent: false, error: e.message };
        }
      }
      await supabaseAdmin
        .from("tasks")
        .update({
          approved_by: "operator",
          approved_at: new Date().toISOString(),
          status: externalResult?.sent === false ? "blocked" : "done",
          completed_at: externalResult?.sent === false ? null : new Date().toISOString(),
        })
        .eq("id", appr.task_id);
    }
    await appendAudit({
      action: `approval.${data.decision}`,
      target: data.approval_id,
      payload: { notes: data.notes ?? null, external: externalResult },
    });
    return { ok: true, external: externalResult };
  });

export const pinDirective = createServerFn({ method: "POST" })
  .inputValidator((d: { agent_slug: string; body: string }) => d)
  .handler(async ({ data }) => {
    const { data: agent } = await supabaseAdmin
      .from("agents").select("id").eq("slug", data.agent_slug).single();
    if (!agent) throw new Error("agent not found");
    const { data: dir } = await supabaseAdmin
      .from("directives")
      .insert({ agent_id: agent.id, body: data.body })
      .select().single();
    await appendAudit({
      action: "directive.pinned",
      agent_slug: data.agent_slug,
      target: dir!.id,
      payload: { body: data.body },
    });
    return dir;
  });

export const listDirectives = createServerFn({ method: "GET" })
  .inputValidator((d: { agent_slug: string }) => d)
  .handler(async ({ data }) => {
    const { data: agent } = await supabaseAdmin
      .from("agents").select("id").eq("slug", data.agent_slug).single();
    if (!agent) return [];
    const { data: dirs } = await supabaseAdmin
      .from("directives").select("*").eq("agent_id", agent.id).eq("active", true)
      .order("created_at", { ascending: false });
    return dirs ?? [];
  });

// ─────────────────────────────────────────────────────────────────────────
// LLM tool-calling delegated to Hermes via OpenRouter (see src/server/llm.server.ts)
// ─────────────────────────────────────────────────────────────────────────


function artifactToMarkdown(a: Artifact): string {
  const sections = a.sections
    .map(s => `### ${s.heading}\n\n${s.body_md}`)
    .join("\n\n");
  const items = a.action_items.length
    ? `\n\n### Action Items\n\n| # | Task | Owner | Deliverable | Due | Auto |\n|---|------|-------|-------------|-----|------|\n${a.action_items
        .map((it, i) => `| ${i + 1} | ${it.task} | ${it.owner_agent.toUpperCase()} | ${it.deliverable} | ${it.due} | ${it.auto_dispatch ? "✓" : "gate"} |`)
        .join("\n")}`
    : "";
  const next = a.suggested_next_commands.length
    ? `\n\n### Next\n${a.suggested_next_commands.map(c => `- \`${c}\``).join("\n")}`
    : "";
  return `# ${a.title}\n\n${sections}${items}${next}`;
}

function consultToMarkdown(c: Consult, agentRole: string): string {
  const head = `**${agentRole} — ${c.position.toUpperCase()}${c.blocking ? " · BLOCKING" : ""}**`;
  const am = c.amendments.length
    ? `\n\n**Amendments:**\n${c.amendments.map(a => `- ${a}`).join("\n")}`
    : "";
  return `${head}\n\n${c.rationale}${am}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Dispatch: solo or boardroom, with tool-calling and action-item fan-out
// ─────────────────────────────────────────────────────────────────────────

export const dispatch = createServerFn({ method: "POST" })
  .inputValidator((d: {
    raw: string;
    agent_slug: string;
    verb: string;
    args: string;
    thread_id?: string | null;
    boardroom?: boolean;
    parent_task_id?: string | null;
    prompt?: string | null;
    freeform?: boolean;
  }) => d)
  .handler(async ({ data }) => {
    const { data: agents } = await supabaseAdmin.from("agents").select("*");
    const primary = agents!.find(a => a.slug === data.agent_slug);
    if (!primary) throw new Error(`Unknown agent: ${data.agent_slug}`);

    const isFreeform = !!data.freeform && !!data.prompt;

    // Resolve / create thread
    let threadId = data.thread_id ?? null;
    if (!threadId) {
      const titleSeed = isFreeform
        ? `${primary.role}: ${data.prompt}`
        : `${primary.role}: ${data.verb} ${data.args}`;
      const { data: t } = await supabaseAdmin
        .from("threads")
        .insert({
          agent_id: primary.id,
          mode: data.boardroom ? "boardroom" : "solo",
          title: titleSeed.slice(0, 120),
        })
        .select().single();
      threadId = t!.id;
    }

    // Persist operator command
    const operatorContent = isFreeform
      ? (data.boardroom ? `@board ${data.prompt}` : `@${data.agent_slug} ${data.prompt}`)
      : `:${data.agent_slug} ${data.verb} ${data.args}`.trim();
    await supabaseAdmin.from("messages").insert({
      thread_id: threadId,
      role: "user",
      content: operatorContent,
    });

    // Active directives
    const { data: dirs } = await supabaseAdmin
      .from("directives").select("body").eq("agent_id", primary.id).eq("active", true);
    const directives = (dirs ?? []).map((d: any) => d.body as string);

    // Phase 2: load company context + recent decisions
    const { data: ctxRow } = await supabaseAdmin
      .from("company_context").select("*").limit(1).maybeSingle();
    const companyContext = renderCompanyContext(ctxRow);
    const { data: recentDecisions } = await supabaseAdmin
      .from("decision_log")
      .select("title, decision, created_at")
      .order("created_at", { ascending: false })
      .limit(6);

    const userPrompt = isFreeform
      ? `Operator prompt:\n${data.prompt}\n\nRespond now using exactly one of the available tools.`
      : `Verb: ${data.verb}\nArguments: ${data.args || "(none)"}\n\nProduce the structured artifact now.`;

    // Primary agent system prompt
    const primarySystem = buildSystemPrompt({
      agentSlug: primary.slug,
      agentRole: primary.role,
      agentMandate: primary.mandate,
      agentTone: primary.tone,
      baseSystemPrompt: primary.system_prompt,
      directives,
      companyContext,
      recentDecisions: recentDecisions ?? [],
      freeform: isFreeform && !data.boardroom,
    });

    // Free-form solo path: model picks chat_reply OR emit_artifact
    if (isFreeform && !data.boardroom) {
      const r = await callTool<any>({
        system: primarySystem,
        user: userPrompt,
        tools: [CHAT_TOOL, ARTIFACT_TOOL],
        toolChoice: "auto",
      });
      if (r.name === "chat_reply") {
        const chat = r.result as ChatReply;
        await supabaseAdmin.from("messages").insert({
          thread_id: threadId,
          agent_id: primary.id,
          role: "agent",
          content: chat.reply_markdown,
          artifact_json: { kind: "chat", ...chat } as any,
        });
        const audit = await appendAudit({
          action: "agent.chatted",
          agent_slug: primary.slug,
          target: threadId,
          payload: { prompt: data.prompt, length: chat.reply_markdown.length },
        });
        return {
          thread_id: threadId,
          chat,
          consults: [],
          requires_approval: false,
          audit_hash: audit.hash_self,
          child_task_ids: [],
        };
      }
      // else fall through with artifact result
      var artifact = r.result as Artifact;
    } else {
      const r = await callTool<Artifact>({
        system: primarySystem,
        user: userPrompt,
        tool: ARTIFACT_TOOL,
      });
      var artifact = r.result;
    }

    const primaryMd = artifactToMarkdown(artifact);
    await supabaseAdmin.from("messages").insert({
      thread_id: threadId,
      agent_id: primary.id,
      role: "agent",
      content: primaryMd,
      artifact_json: artifact as any,
    });

    // Boardroom consults
    const consults: { slug: string; role: string; consult: Consult }[] = [];
    if (data.boardroom && primary.consult_with?.length) {
      for (const slug of primary.consult_with as string[]) {
        const consult = agents!.find(a => a.slug === slug);
        if (!consult) continue;
        const consultSystem = buildSystemPrompt({
          agentSlug: consult.slug,
          agentRole: consult.role,
          agentMandate: consult.mandate,
          agentTone: consult.tone,
          baseSystemPrompt: consult.system_prompt,
          directives: [],
          companyContext,
          recentDecisions: recentDecisions ?? [],
          consultFor: { primaryRole: primary.role, primaryReply: primaryMd },
        });
        try {
          const cr = await callTool<Consult>({
            system: consultSystem,
            user: userPrompt,
            tool: CONSULT_TOOL,
          });
          const c = cr.result;
          await supabaseAdmin.from("messages").insert({
            thread_id: threadId,
            agent_id: consult.id,
            role: "agent",
            content: consultToMarkdown(c, consult.role),
            artifact_json: { kind: "consult", ...c } as any,
          });
          consults.push({ slug: consult.slug, role: consult.role, consult: c });
        } catch (e: any) {
          await supabaseAdmin.from("messages").insert({
            thread_id: threadId,
            agent_id: consult.id,
            role: "agent",
            content: `*${consult.role} unable to respond: ${e.message}*`,
          });
        }
      }
    }

    // Approval gate (artifact-level) — model flag OR keyword heuristic
    const requiresApproval =
      artifact.requires_external_approval || shouldGate(data.verb, data.args);

    // Parent task row
    const { data: parentTask } = await supabaseAdmin.from("tasks").insert({
      agent_id: primary.id,
      thread_id: threadId,
      parent_task_id: data.parent_task_id ?? null,
      owner_agent: primary.slug,
      title: artifact.title.slice(0, 200),
      body: isFreeform ? (data.prompt ?? "") : data.args,
      status: requiresApproval ? "blocked" : "done",
      requires_approval: requiresApproval,
      completed_at: requiresApproval ? null : new Date().toISOString(),
    }).select().single();

    if (requiresApproval && parentTask) {
      await supabaseAdmin.from("approvals").insert({
        task_id: parentTask.id,
        status: "pending",
      });
    }

    // Fan out action items as child tasks
    const childTaskIds: string[] = [];
    for (const item of artifact.action_items ?? []) {
      const owner = agents!.find(a => a.slug === item.owner_agent);
      if (!owner) continue;
      const isInternal =
        item.auto_dispatch && !shouldGate(item.task, item.deliverable);
      const { data: child } = await supabaseAdmin.from("tasks").insert({
        agent_id: owner.id,
        thread_id: threadId,
        parent_task_id: parentTask?.id ?? null,
        owner_agent: owner.slug,
        title: item.task.slice(0, 200),
        body: `${item.deliverable}\n\nDue: ${item.due}`,
        status: isInternal ? "todo" : "blocked",
        requires_approval: !isInternal,
        auto_dispatched: isInternal,
      }).select().single();
      if (child) childTaskIds.push(child.id);
      if (!isInternal && child) {
        await supabaseAdmin.from("approvals").insert({
          task_id: child.id,
          status: "pending",
        });
      }
    }

    const audit = await appendAudit({
      action: data.boardroom ? "boardroom.dispatched" : "agent.dispatched",
      agent_slug: primary.slug,
      target: threadId,
      payload: {
        verb: data.verb,
        args: data.args,
        prompt: data.prompt ?? null,
        title: artifact.title,
        action_items: artifact.action_items.length,
        child_tasks: childTaskIds.length,
        consults: consults.length,
        requires_approval: requiresApproval,
      },
    });

    // Phase 2: log decision for cross-thread recall
    const finalSection = artifact.sections.find((s: any) =>
      /final decision|recommendation|summary/i.test(s.heading)
    ) ?? artifact.sections[0];
    await supabaseAdmin.from("decision_log").insert({
      thread_id: threadId,
      agent_slug: primary.slug,
      title: artifact.title.slice(0, 200),
      decision: (finalSection?.body_md ?? "").slice(0, 1000),
      rationale: (isFreeform ? `prompt: ${data.prompt}` : `${data.verb} ${data.args}`).slice(0, 500),
      amendments: consults.flatMap(c => c.consult.amendments ?? []),
    });

    return {
      thread_id: threadId,
      artifact,
      consults,
      requires_approval: requiresApproval,
      audit_hash: audit.hash_self,
      child_task_ids: childTaskIds,
    };
  });

// ─────────────────────────────────────────────────────────────────────────
// Router: pick agent(s) for a free-form prompt
// ─────────────────────────────────────────────────────────────────────────

export const routePrompt = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string; force_boardroom?: boolean }) => d)
  .handler(async ({ data }) => {
    const { data: agents } = await supabaseAdmin
      .from("agents").select("slug,role,mandate").order("sort_order");
    const { data: ctxRow } = await supabaseAdmin
      .from("company_context").select("*").limit(1).maybeSingle();
    const companyContext = renderCompanyContext(ctxRow) || DEFAULT_COMPANY_CONTEXT;

    const system = buildRouterPrompt({
      agents: (agents ?? []) as any,
      companyContext,
      forceBoardroom: data.force_boardroom,
    });
    const r = await callTool<RouteDecision>({
      system,
      user: `Operator prompt:\n${data.prompt}\n\nReturn the routing decision now.`,
      tool: ROUTE_TOOL,
    });
    const decision = r.result;
    if (data.force_boardroom) decision.mode = "boardroom";
    // Sanity: filter consult slugs to known agents and exclude primary
    const known = new Set((agents ?? []).map((a: any) => a.slug));
    decision.consult_agents = (decision.consult_agents ?? [])
      .filter(s => known.has(s) && s !== decision.primary_agent)
      .slice(0, 3);
    if (decision.mode === "solo") decision.consult_agents = [];
    return decision;
  });

export const verifyChain = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin.from("audit_log").select("*").order("id");
  if (!data || !data.length) return { ok: true, count: 0 };
  let prev: string | null = null;
  for (const row of data) {
    if (row.prev_hash !== prev) return { ok: false, broken_at: row.id };
    prev = row.hash_self;
  }
  return { ok: true, count: data.length, head: prev };
});

