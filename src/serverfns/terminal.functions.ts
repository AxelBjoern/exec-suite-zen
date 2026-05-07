import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";
import {
  ARTIFACT_TOOL,
  CONSULT_TOOL,
  type Artifact,
  type Consult,
  shouldGate,
  INTERNAL_VERBS,
} from "@/lib/agent-schemas";
import { buildSystemPrompt, renderCompanyContext } from "@/lib/agent-prompts";

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

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
    if (appr?.task_id && data.decision === "approved") {
      await supabaseAdmin
        .from("tasks")
        .update({
          approved_by: "operator",
          approved_at: new Date().toISOString(),
          status: "done",
          completed_at: new Date().toISOString(),
        })
        .eq("id", appr.task_id);
    }
    await appendAudit({
      action: `approval.${data.decision}`,
      target: data.approval_id,
      payload: { notes: data.notes ?? null },
    });
    return { ok: true };
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
// AI Gateway calls — structured tool-calling
// ─────────────────────────────────────────────────────────────────────────

async function callTool<T>(opts: {
  system: string;
  user: string;
  tool: typeof ARTIFACT_TOOL | typeof CONSULT_TOOL;
  model?: string;
}): Promise<T> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(LOVABLE_AI, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      tools: [opts.tool],
      tool_choice: { type: "function", function: { name: opts.tool.function.name } },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Wait a moment and retry.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable Cloud → AI.");
    throw new Error(`AI Gateway ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    throw new Error("AI did not return a structured tool call");
  }
  try {
    return JSON.parse(call.function.arguments) as T;
  } catch (e: any) {
    throw new Error(`Failed to parse tool args: ${e.message}`);
  }
}

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
  }) => d)
  .handler(async ({ data }) => {
    const { data: agents } = await supabaseAdmin.from("agents").select("*");
    const primary = agents!.find(a => a.slug === data.agent_slug);
    if (!primary) throw new Error(`Unknown agent: ${data.agent_slug}`);

    // Resolve / create thread
    let threadId = data.thread_id ?? null;
    if (!threadId) {
      const { data: t } = await supabaseAdmin
        .from("threads")
        .insert({
          agent_id: primary.id,
          mode: data.boardroom ? "boardroom" : "solo",
          title: `${primary.role}: ${data.verb} ${data.args}`.slice(0, 120),
        })
        .select().single();
      threadId = t!.id;
    }

    // Persist operator command
    await supabaseAdmin.from("messages").insert({
      thread_id: threadId,
      role: "user",
      content: `:${data.agent_slug} ${data.verb} ${data.args}`.trim(),
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

    const userPrompt = `Verb: ${data.verb}\nArguments: ${data.args || "(none)"}\n\nProduce the structured artifact now.`;

    // Primary agent → structured artifact
    const primarySystem = buildSystemPrompt({
      agentSlug: primary.slug,
      agentRole: primary.role,
      agentMandate: primary.mandate,
      agentTone: primary.tone,
      baseSystemPrompt: primary.system_prompt,
      directives,
      companyContext,
      recentDecisions: recentDecisions ?? [],
    });

    const artifact = await callTool<Artifact>({
      system: primarySystem,
      user: userPrompt,
      tool: ARTIFACT_TOOL,
    });

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
          consultFor: { primaryRole: primary.role, primaryReply: primaryMd },
        });
        try {
          const c = await callTool<Consult>({
            system: consultSystem,
            user: userPrompt,
            tool: CONSULT_TOOL,
          });
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
      body: data.args,
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
        title: artifact.title,
        action_items: artifact.action_items.length,
        child_tasks: childTaskIds.length,
        consults: consults.length,
        requires_approval: requiresApproval,
      },
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

