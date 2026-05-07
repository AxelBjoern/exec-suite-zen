import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

const EXEC_KEYWORDS = ["draft", "post", "memo", "board deck", "press", "announce", "publish", "pricing"];

async function callAI(opts: { system: string; user: string; model?: string }) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(LOVABLE_AI, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Wait a moment and retry.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable Cloud → AI.");
    throw new Error(`AI Gateway ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

export const dispatch = createServerFn({ method: "POST" })
  .inputValidator((d: {
    raw: string;
    agent_slug: string;
    verb: string;
    args: string;
    thread_id?: string | null;
    boardroom?: boolean;
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

    // Persist user command
    await supabaseAdmin.from("messages").insert({
      thread_id: threadId,
      role: "user",
      content: `:${data.agent_slug} ${data.verb} ${data.args}`.trim(),
    });

    // Active directives
    const { data: dirs } = await supabaseAdmin
      .from("directives").select("body").eq("agent_id", primary.id).eq("active", true);
    const directiveBlock = dirs?.length
      ? `\n\nActive standing directives:\n${dirs.map((d: any) => `- ${d.body}`).join("\n")}`
      : "";

    const userPrompt = `Verb: ${data.verb}\nArguments: ${data.args || "(none)"}\n\nRespond using the executive structure.`;

    // Primary agent reply
    const primaryReply = await callAI({
      system: primary.system_prompt + directiveBlock,
      user: userPrompt,
    });

    await supabaseAdmin.from("messages").insert({
      thread_id: threadId,
      agent_id: primary.id,
      role: "agent",
      content: primaryReply,
    });

    // Boardroom: loop in consults
    const allReplies: { slug: string; name: string; content: string }[] = [
      { slug: primary.slug, name: primary.name, content: primaryReply },
    ];
    if (data.boardroom && primary.consult_with?.length) {
      for (const slug of primary.consult_with as string[]) {
        const consult = agents!.find(a => a.slug === slug);
        if (!consult) continue;
        const consultReply = await callAI({
          system: consult.system_prompt + directiveBlock,
          user: `${userPrompt}\n\n---\nThe ${primary.role} has stated:\n${primaryReply}\n\nRespond from your seat — agree, disagree, add, escalate.`,
          model: "google/gemini-2.5-pro",
        });
        await supabaseAdmin.from("messages").insert({
          thread_id: threadId,
          agent_id: consult.id,
          role: "agent",
          content: consultReply,
        });
        allReplies.push({ slug: consult.slug, name: consult.name, content: consultReply });
      }
    }

    // Approval flag
    const requiresApproval = EXEC_KEYWORDS.some(k =>
      `${data.verb} ${data.args}`.toLowerCase().includes(k)
    );

    // Task row
    const { data: task } = await supabaseAdmin.from("tasks").insert({
      agent_id: primary.id,
      thread_id: threadId,
      title: `${primary.role}: ${data.verb}`.slice(0, 120),
      body: data.args,
      status: requiresApproval ? "blocked" : "done",
      requires_approval: requiresApproval,
      completed_at: requiresApproval ? null : new Date().toISOString(),
    }).select().single();

    if (requiresApproval && task) {
      await supabaseAdmin.from("approvals").insert({
        task_id: task.id,
        status: "pending",
      });
    }

    const audit = await appendAudit({
      action: data.boardroom ? "boardroom.dispatched" : "agent.dispatched",
      agent_slug: primary.slug,
      target: threadId,
      payload: { verb: data.verb, args: data.args, requires_approval: requiresApproval },
    });

    return {
      thread_id: threadId,
      replies: allReplies,
      requires_approval: requiresApproval,
      audit_hash: audit.hash_self,
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
