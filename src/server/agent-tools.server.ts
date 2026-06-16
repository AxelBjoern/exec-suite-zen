// Agent tool registry. Server-only. Zod-typed, per-agent allowlist.
// Each execute() call writes a row to tool_calls for audit.

import { z, ZodTypeAny } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { webSearch, webFetch } from "@/server/web.server";
import { listRepoDir, readRepoFile, searchRepoCode } from "@/server/github.server";

export type ToolCtx = {
  agent_slug: string;
  task_id?: string | null;
  thread_id?: string | null;
  owner_user_id?: string | null;
};

export type ToolDef<T extends ZodTypeAny = ZodTypeAny> = {
  name: string;
  description: string;
  parameters: T;
  readOnly: boolean;
  externalSideEffect?: boolean; // always creates an approval row
  allowedAgents: string[] | "*";
  execute: (args: z.infer<T>, ctx: ToolCtx) => Promise<unknown>;
};

function def<T extends ZodTypeAny>(d: ToolDef<T>): ToolDef<T> { return d; }

// ─── Read-only tools (Phase 1) ───────────────────────────────────────────

const knowledge_list_docs = def({
  name: "knowledge.list_docs",
  description: "List knowledge docs attached to the calling agent. Returns id, title, kind.",
  parameters: z.object({}).strict(),
  readOnly: true,
  allowedAgents: "*",
  async execute(_args, ctx) {
    const { data: agent } = await supabaseAdmin.from("agents").select("id").eq("slug", ctx.agent_slug).maybeSingle();
    if (!agent) return { docs: [] };
    const { data } = await supabaseAdmin
      .from("agent_knowledge")
      .select("id, title, kind, created_at")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return { docs: data ?? [] };
  },
});

const knowledge_read_doc = def({
  name: "knowledge.read_doc",
  description: "Read the extracted text of a knowledge doc by id (already parsed at upload).",
  parameters: z.object({ doc_id: z.string().uuid() }).strict(),
  readOnly: true,
  allowedAgents: "*",
  async execute({ doc_id }) {
    const { data, error } = await supabaseAdmin
      .from("agent_knowledge")
      .select("id, title, kind, extracted_text")
      .eq("id", doc_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { error: "not_found" };
  },
});

const web_search_tool = def({
  name: "web.search",
  description: "Web search via the project's web provider. Returns ranked results.",
  parameters: z.object({ query: z.string().min(1).max(400), limit: z.number().int().min(1).max(10).optional() }).strict(),
  readOnly: true,
  allowedAgents: "*",
  async execute({ query, limit }) {
    return await webSearch(query, limit ?? 5);
  },
});

const web_fetch_tool = def({
  name: "web.fetch",
  description: "Fetch a URL and return its readable content.",
  parameters: z.object({ url: z.string().url() }).strict(),
  readOnly: true,
  allowedAgents: "*",
  async execute({ url }) {
    return await webFetch(url);
  },
});

const db_read_tasks = def({
  name: "db.read_tasks",
  description: "Read tasks (open by default) for the calling agent.",
  parameters: z.object({
    status: z.enum(["todo", "in_progress", "blocked", "done", "any"]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).strict(),
  readOnly: true,
  allowedAgents: "*",
  async execute({ status, limit }, ctx) {
    let q = supabaseAdmin
      .from("tasks")
      .select("id, title, body, status, kind, requires_approval, created_at, completed_at")
      .eq("owner_agent", ctx.agent_slug)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status && status !== "any") q = q.eq("status", status);
    else if (!status) q = q.in("status", ["todo", "in_progress", "blocked"]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { tasks: data ?? [] };
  },
});

const db_read_recent_decisions = def({
  name: "db.read_recent_decisions",
  description: "Recent entries from the decision log.",
  parameters: z.object({ limit: z.number().int().min(1).max(20).optional() }).strict(),
  readOnly: true,
  allowedAgents: "*",
  async execute({ limit }) {
    const { data } = await supabaseAdmin
      .from("decision_log")
      .select("title, decision, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 6);
    return { decisions: data ?? [] };
  },
});

// ─── Write tools (Phase 2) — externalSideEffect=true ─────────────────────

const db_create_reminder = def({
  name: "db.create_reminder",
  description: "Create a reminder for the founder. Title is short; body_md may be markdown.",
  parameters: z.object({
    title: z.string().min(1).max(200),
    body_md: z.string().max(4000).optional(),
    due_at: z.string().datetime().optional(),
    urgency: z.enum(["low", "normal", "high"]).optional(),
  }).strict(),
  readOnly: false,
  externalSideEffect: true,
  allowedAgents: "*",
  async execute(args, ctx) {
    const { data: agent } = await supabaseAdmin.from("agents").select("id").eq("slug", ctx.agent_slug).maybeSingle();
    const { data: task } = await supabaseAdmin.from("tasks").insert({
      agent_id: agent?.id ?? null,
      owner_agent: ctx.agent_slug,
      title: args.title,
      body: args.body_md ?? "",
      kind: "reminder",
      status: "todo",
      requires_approval: true,
      payload: { urgency: args.urgency ?? "normal", due_at: args.due_at ?? null, owner_id: ctx.owner_user_id ?? null } as any,
    }).select().single();
    await supabaseAdmin.from("approvals").insert({
      task_id: task?.id ?? null, status: "pending", kind: "reminder",
      ref_table: "tasks", ref_id: task?.id ?? null,
      payload: { agent_slug: ctx.agent_slug } as any,
    });
    return { ok: true, task_id: task?.id };
  },
});

const outbound_draft_linkedin = def({
  name: "outbound.draft_linkedin",
  description: "Draft a LinkedIn post for operator review. Does NOT publish.",
  parameters: z.object({
    body_md: z.string().min(20).max(3000),
    target_audience: z.string().max(200).optional(),
    suggested_post_time: z.string().datetime().optional(),
  }).strict(),
  readOnly: false,
  externalSideEffect: true,
  allowedAgents: ["linkedin", "social", "cmo", "ceo"],
  async execute(args, ctx) {
    const { data: agent } = await supabaseAdmin.from("agents").select("id").eq("slug", ctx.agent_slug).maybeSingle();
    const { data: draft } = await supabaseAdmin.from("content_drafts").insert({
      owner_id: ctx.owner_user_id ?? null,
      agent_id: agent?.id ?? null,
      kind: "linkedin_post",
      body_md: args.body_md,
      metadata: { target_audience: args.target_audience ?? null, suggested_post_time: args.suggested_post_time ?? null } as any,
      status: "pending_approval",
    }).select().single();
    const { data: appr } = await supabaseAdmin.from("approvals").insert({
      status: "pending", kind: "content_draft",
      ref_table: "content_drafts", ref_id: draft?.id ?? null,
      payload: { agent_slug: ctx.agent_slug, kind: "linkedin_post" } as any,
    }).select().single();
    if (draft && appr) await supabaseAdmin.from("content_drafts").update({ approval_id: appr.id }).eq("id", draft.id);
    return { ok: true, draft_id: draft?.id };
  },
});

const outbound_draft_email = def({
  name: "outbound.draft_email",
  description: "Draft an outbound email for operator review. Does NOT send.",
  parameters: z.object({
    to_lead_id: z.string().uuid().optional(),
    subject: z.string().min(1).max(200),
    body_md: z.string().min(20).max(8000),
  }).strict(),
  readOnly: false,
  externalSideEffect: true,
  allowedAgents: ["sales", "cmo", "ceo", "linkedin"],
  async execute(args, ctx) {
    const { data: agent } = await supabaseAdmin.from("agents").select("id").eq("slug", ctx.agent_slug).maybeSingle();
    const { data: draft } = await supabaseAdmin.from("content_drafts").insert({
      owner_id: ctx.owner_user_id ?? null,
      agent_id: agent?.id ?? null,
      kind: "email",
      body_md: args.body_md,
      metadata: { subject: args.subject, to_lead_id: args.to_lead_id ?? null } as any,
      status: "pending_approval",
    }).select().single();
    const { data: appr } = await supabaseAdmin.from("approvals").insert({
      status: "pending", kind: "content_draft",
      ref_table: "content_drafts", ref_id: draft?.id ?? null,
      payload: { agent_slug: ctx.agent_slug, kind: "email", subject: args.subject } as any,
    }).select().single();
    if (draft && appr) await supabaseAdmin.from("content_drafts").update({ approval_id: appr.id }).eq("id", draft.id);
    return { ok: true, draft_id: draft?.id };
  },
});

const db_draft_lead_reply = def({
  name: "db.draft_lead_reply",
  description: "Write a draft response onto an existing lead_reply row, with classification.",
  parameters: z.object({
    reply_id: z.string().uuid(),
    classification: z.enum(["positive", "neutral", "objection", "spam", "unsubscribe", "other"]),
    draft_response: z.string().min(10).max(4000),
  }).strict(),
  readOnly: false,
  externalSideEffect: true,
  allowedAgents: ["sales", "cmo", "ceo"],
  async execute(args, ctx) {
    const { error } = await supabaseAdmin.from("lead_replies").update({
      classification: args.classification,
      draft_response: args.draft_response,
    }).eq("id", args.reply_id);
    if (error) throw new Error(error.message);
    const { data: appr } = await supabaseAdmin.from("approvals").insert({
      status: "pending", kind: "lead_reply",
      ref_table: "lead_replies", ref_id: args.reply_id,
      payload: { agent_slug: ctx.agent_slug, classification: args.classification } as any,
    }).select().single();
    return { ok: true, approval_id: appr?.id };
  },
});

// ─── Registry & executor ─────────────────────────────────────────────────

export const TOOL_REGISTRY: ToolDef<any>[] = [
  knowledge_list_docs as ToolDef<any>,
  knowledge_read_doc as ToolDef<any>,
  web_search_tool as ToolDef<any>,
  web_fetch_tool as ToolDef<any>,
  db_read_tasks as ToolDef<any>,
  db_read_recent_decisions as ToolDef<any>,
  db_create_reminder as ToolDef<any>,
  outbound_draft_linkedin as ToolDef<any>,
  outbound_draft_email as ToolDef<any>,
  db_draft_lead_reply as ToolDef<any>,
];

export const READ_ONLY_TOOL_NAMES = TOOL_REGISTRY.filter(t => t.readOnly).map(t => t.name);

export function getTool(name: string): ToolDef<any> | undefined {
  return TOOL_REGISTRY.find(t => t.name === name);
}

export function toolsForAgent(agent_slug: string, names?: string[]): ToolDef<any>[] {
  const pool = names ? names.map(getTool).filter(Boolean) as ToolDef<any>[] : TOOL_REGISTRY;
  return pool.filter(t => t.allowedAgents === "*" || t.allowedAgents.includes(agent_slug));
}

/** OpenRouter `tools` array for native tool-calling models. */
export function toOpenRouterTools(tools: ToolDef<any>[]) {
  return tools.map(t => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.parameters),
    },
  }));
}

// Minimal Zod → JSON schema (only the shapes our tools use).
function zodToJsonSchema(schema: ZodTypeAny): any {
  const def: any = (schema as any)._def;
  if (def.typeName === "ZodObject") {
    const shape = def.shape();
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      const vv = v as ZodTypeAny;
      properties[k] = zodToJsonSchema(vv);
      if (!(vv as any).isOptional?.()) required.push(k);
    }
    return { type: "object", properties, required, additionalProperties: false };
  }
  if (def.typeName === "ZodString") {
    const out: any = { type: "string" };
    for (const c of def.checks ?? []) {
      if (c.kind === "min") out.minLength = c.value;
      if (c.kind === "max") out.maxLength = c.value;
      if (c.kind === "uuid") out.format = "uuid";
      if (c.kind === "url") out.format = "uri";
      if (c.kind === "datetime") out.format = "date-time";
    }
    return out;
  }
  if (def.typeName === "ZodNumber") return { type: "integer" };
  if (def.typeName === "ZodBoolean") return { type: "boolean" };
  if (def.typeName === "ZodEnum") return { type: "string", enum: def.values };
  if (def.typeName === "ZodOptional") return zodToJsonSchema(def.innerType);
  if (def.typeName === "ZodArray") return { type: "array", items: zodToJsonSchema(def.type) };
  return {};
}

export async function executeToolCall(
  name: string,
  rawArgs: unknown,
  ctx: ToolCtx,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `unknown tool: ${name}` };
  if (tool.allowedAgents !== "*" && !tool.allowedAgents.includes(ctx.agent_slug)) {
    return { ok: false, error: `agent "${ctx.agent_slug}" not allowed to call ${name}` };
  }
  const parsed = tool.parameters.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const err = parsed.error.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logCall(name, ctx, rawArgs, null, "error", err);
    return { ok: false, error: `invalid args: ${err}` };
  }
  try {
    const result = await tool.execute(parsed.data as any, ctx);
    await logCall(name, ctx, parsed.data, result, "ok");
    return { ok: true, result };
  } catch (e: any) {
    await logCall(name, ctx, parsed.data, null, "error", e?.message ?? String(e));
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function logCall(tool: string, ctx: ToolCtx, request: unknown, response: unknown, status: string, error?: string) {
  try {
    await supabaseAdmin.from("tool_calls").insert({
      task_id: ctx.task_id ?? null,
      agent_slug: ctx.agent_slug,
      tool,
      request: request as any,
      response: response as any,
      status,
      error: error ?? null,
    });
  } catch {
    // swallow logging failure
  }
}
