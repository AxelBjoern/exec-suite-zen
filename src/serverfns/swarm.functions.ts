// Swarm mode: fan a single prompt to multiple models in parallel, then
// synthesize the drafts with a single arbiter model into one best-in-class
// reply. All calls go through OpenRouter via src/server/llm.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatCompletion, resolveTextChatModel } from "@/server/llm.server";

// Allowed text models (from core memory). Kling is video — excluded.
export const ALLOWED_SWARM_MODELS: { slug: string; label: string }[] = [
  { slug: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7" },
  { slug: "openai/gpt-5.3-chat", label: "ChatGPT 5.3" },
  { slug: "x-ai/grok-4.3", label: "Grok 4.3" },
  { slug: "nousresearch/hermes-4-405b", label: "Hermes 4 405B" },
  { slug: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { slug: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { slug: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron 3 Nano Omni 30B" },
];
export const ALLOWED_SET = new Set(ALLOWED_SWARM_MODELS.map((m) => m.slug));
export const LABEL_BY_SLUG = new Map(ALLOWED_SWARM_MODELS.map((m) => [m.slug, m.label] as const));

// Tuned defaults (benchmark: Opus best synth on reasoning + tone; top-4 drafters
// span reasoning styles for genuine diversity without heavy overlap).
export const DEFAULT_SWARM_MODELS = [
  "anthropic/claude-opus-4.7",
  "openai/gpt-5.3-chat",
  "x-ai/grok-4.3",
  "nousresearch/hermes-4-405b",
];
export const DEFAULT_SYNTH_MODEL = "anthropic/claude-opus-4.7";
export const DEFAULT_MAX_PARALLEL = 4;

// Role-based agents. Each role has a default model + tailored system prompt.
export type SwarmRole = "ceo" | "cto" | "cmo" | "sales" | "seo" | "social";
export type SwarmAgent = {
  role: SwarmRole;
  label: string;
  model: string;
  enabled: boolean;
  systemPrompt: string;
};

export const SWARM_ROLE_DEFAULTS: SwarmAgent[] = [
  {
    role: "ceo",
    label: "CEO",
    model: "anthropic/claude-opus-4.7",
    enabled: true,
    systemPrompt: "You are the CEO. Answer with strategic clarity: prioritize outcomes, tradeoffs, risk, and decisions. Be concise, opinionated, and executive. Prefer bullets and a clear recommendation.",
  },
  {
    role: "cto",
    label: "CTO",
    model: "openai/gpt-5.3-chat",
    enabled: true,
    systemPrompt: "You are the CTO. Answer with technical rigor: architecture, tradeoffs, feasibility, security, scalability, and implementation plan. Include concrete stack/tooling choices and pitfalls.",
  },
  {
    role: "cmo",
    label: "CMO",
    model: "x-ai/grok-4.3",
    enabled: true,
    systemPrompt: "You are the CMO. Answer through positioning, ICP, messaging, funnel, and growth loops. Give a crisp value prop, differentiators, and 2–3 concrete campaign ideas with channels.",
  },
  {
    role: "sales",
    label: "Sales",
    model: "nousresearch/hermes-4-405b",
    enabled: true,
    systemPrompt: "You are the Sales lead. Answer through pipeline, objections, outreach, and closing. Produce specific talk tracks, discovery questions, or email copy. Prioritize what wins deals this quarter.",
  },
  {
    role: "seo",
    label: "SEO",
    model: "deepseek/deepseek-v4-pro",
    enabled: false,
    systemPrompt: "You are the SEO lead. Answer through keyword intent, SERP structure, on-page, technical SEO, internal links, and content briefs. Give concrete keywords, titles, and structural recommendations.",
  },
  {
    role: "social",
    label: "Social",
    model: "deepseek/deepseek-v4-flash",
    enabled: false,
    systemPrompt: "You are the Social lead. Answer through platform-native hooks (LinkedIn, X, IG). Produce ready-to-post copy with strong opens, formatting for skim, and clear CTAs. Match tone to the platform.",
  },
];

const ROLE_SET = new Set<SwarmRole>(SWARM_ROLE_DEFAULTS.map((a) => a.role));

export function normalizeAgents(raw: any): SwarmAgent[] {
  const list: SwarmAgent[] = SWARM_ROLE_DEFAULTS.map((d) => ({ ...d }));
  if (!Array.isArray(raw)) return list;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const role = entry.role as SwarmRole;
    if (!ROLE_SET.has(role)) continue;
    const target = list.find((a) => a.role === role);
    if (!target) continue;
    if (typeof entry.model === "string" && ALLOWED_SET.has(entry.model)) target.model = entry.model;
    if (typeof entry.enabled === "boolean") target.enabled = entry.enabled;
    if (typeof entry.systemPrompt === "string" && entry.systemPrompt.trim()) target.systemPrompt = entry.systemPrompt;
  }
  return list;
}

export const SYNTH_SYSTEM = `You are the arbiter of a multi-model swarm. You will receive several independent drafts written by other AI models in response to the same user prompt. Your job is to produce ONE final answer that is strictly better than any single draft: more accurate, more complete, better structured, and better calibrated in tone.

Rules:
- Silently reconcile disagreements. If a claim is contested and material, note the disagreement briefly ("sources differ on X"), don't pretend consensus.
- Prefer verifiable specifics over vague generalities. Drop hallucinations.
- Keep the strongest reasoning, examples, and structure from across the drafts. Do not lose useful detail.
- Do not mention the drafts, the models, "draft A", or the swarm process. Write as one coherent voice.
- Match the user's requested length/format. If they asked for markdown, code, or a list, deliver that.
- If drafts are all weak, answer from your own capability rather than parroting them.`;

export function normalizeModels(models: string[] | null | undefined, cap = 6): string[] {
  const list = (models ?? []).filter((m) => typeof m === "string" && ALLOWED_SET.has(m));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of list) {
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= cap) break;
  }
  return out;
}

// ── Config ─────────────────────────────────────────────────────────────────
export const getSwarmConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("user_settings")
      .select("swarm_models,swarm_synth_model,swarm_max_parallel,swarm_agents")
      .eq("user_id", userId)
      .maybeSingle();
    const models = normalizeModels(data?.swarm_models ?? DEFAULT_SWARM_MODELS);
    const synth = data?.swarm_synth_model && ALLOWED_SET.has(data.swarm_synth_model)
      ? data.swarm_synth_model
      : DEFAULT_SYNTH_MODEL;
    const maxParallel = Math.min(6, Math.max(2, Number(data?.swarm_max_parallel ?? DEFAULT_MAX_PARALLEL)));
    const agents = normalizeAgents(data?.swarm_agents);
    return {
      models: models.length >= 2 ? models : DEFAULT_SWARM_MODELS,
      synthModel: synth,
      maxParallel,
      available: ALLOWED_SWARM_MODELS,
      agents,
      roleDefaults: SWARM_ROLE_DEFAULTS,
    };
  });

export const saveSwarmConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    models?: string[];
    synthModel?: string;
    maxParallel?: number;
    agents?: Array<{ role: string; model?: string; enabled?: boolean; systemPrompt?: string }>;
  }) => ({
    models: Array.isArray(d?.models) ? d.models : [],
    synthModel: d?.synthModel ?? DEFAULT_SYNTH_MODEL,
    maxParallel: Number(d?.maxParallel ?? DEFAULT_MAX_PARALLEL),
    agents: Array.isArray(d?.agents) ? d.agents : null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const cleaned = normalizeModels(data.models);
    if (cleaned.length < 2) throw new Error("Pick at least 2 models for swarm mode.");
    const synth = ALLOWED_SET.has(data.synthModel) ? data.synthModel : DEFAULT_SYNTH_MODEL;
    const cap = Math.min(6, Math.max(2, data.maxParallel || DEFAULT_MAX_PARALLEL));
    const agents = data.agents ? normalizeAgents(data.agents) : null;
    const patch: any = {
      user_id: userId,
      swarm_models: cleaned,
      swarm_synth_model: synth,
      swarm_max_parallel: cap,
      updated_at: new Date().toISOString(),
    };
    if (agents) patch.swarm_agents = agents;
    const { error } = await supabase
      .from("user_settings")
      .upsert(patch, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true, models: cleaned, synthModel: synth, maxParallel: cap, agents };
  });


// ── Run swarm ──────────────────────────────────────────────────────────────
type DraftResult = {
  model: string;
  label: string;
  role?: SwarmRole | null;
  roleLabel?: string | null;
  status: "ok" | "error";
  content: string;
  error?: string;
  latency_ms: number;
  tokens_in?: number;
  tokens_out?: number;
};

export async function draftOne(model: string, userContent: string, systemPrompt: string): Promise<DraftResult> {
  const label = LABEL_BY_SLUG.get(model) ?? model;
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const json = await Promise.race([
      chatCompletion({
        model: resolveTextChatModel(model),
        temperature: 0.6,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
      new Promise<never>((_, rej) =>
        controller.signal.addEventListener("abort", () => rej(new Error("timeout"))),
      ),
    ]);
    clearTimeout(timer);
    const content = json?.choices?.[0]?.message?.content?.trim() || "";
    if (!content) throw new Error("empty response");
    return {
      model,
      label,
      status: "ok",
      content,
      latency_ms: Date.now() - started,
      tokens_in: json?.usage?.prompt_tokens,
      tokens_out: json?.usage?.completion_tokens,
    };
  } catch (e: any) {
    return {
      model,
      label,
      status: "error",
      content: "",
      error: e?.message ?? String(e),
      latency_ms: Date.now() - started,
    };
  }
}

export const runSwarm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    content: string;
    conversationId?: string | null;
    models?: string[];
    synthModel?: string;
    agents?: Array<{ role: string; model?: string; enabled?: boolean; systemPrompt?: string }> | null;
    useAgents?: boolean;
  }) => {
    const c = (d?.content ?? "").trim();
    if (!c) throw new Error("Empty prompt");
    if (c.length > 8000) throw new Error("Prompt too long");
    return {
      content: c,
      conversationId: d?.conversationId ?? null,
      models: Array.isArray(d?.models) ? d.models : [],
      synthModel: d?.synthModel ?? DEFAULT_SYNTH_MODEL,
      agents: Array.isArray(d?.agents) ? d.agents : null,
      useAgents: d?.useAgents !== false, // default true
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin = admin as any;

    // Load user config, merge with per-call overrides
    const { data: cfg } = await supabase
      .from("user_settings")
      .select("swarm_models,swarm_synth_model,swarm_max_parallel,swarm_agents")
      .eq("user_id", userId)
      .maybeSingle();

    const cap = Math.min(6, Math.max(2, cfg?.swarm_max_parallel ?? DEFAULT_MAX_PARALLEL));
    const synthModel = ALLOWED_SET.has(data.synthModel) ? data.synthModel : (cfg?.swarm_synth_model || DEFAULT_SYNTH_MODEL);

    // Decide fan-out: role-based agents (preferred) or legacy models list.
    const agentsResolved = normalizeAgents(data.agents ?? cfg?.swarm_agents);
    const activeAgents = agentsResolved.filter((a) => a.enabled && ALLOWED_SET.has(a.model)).slice(0, cap);

    type FanUnit = { model: string; systemPrompt: string; role: SwarmRole | null; roleLabel: string | null };
    let units: FanUnit[];
    if (data.useAgents && activeAgents.length >= 2) {
      units = activeAgents.map((a) => ({
        model: a.model,
        systemPrompt: a.systemPrompt,
        role: a.role,
        roleLabel: a.label,
      }));
    } else {
      const models = normalizeModels(
        data.models.length ? data.models : (cfg?.swarm_models ?? DEFAULT_SWARM_MODELS),
        cap,
      );
      if (models.length < 2) throw new Error("Swarm requires at least 2 models. Configure in the Swarm menu.");
      const drafterSystem = "You are a top-tier assistant. Give the best answer you can to the user's message. Be specific, correct, and useful. Prefer markdown structure when helpful.";
      units = models.map((m) => ({ model: m, systemPrompt: drafterSystem, role: null, roleLabel: null }));
    }

    // Ensure conversation
    let convId = data.conversationId;
    if (!convId) {
      const title = data.content.slice(0, 80);
      const { data: conv, error: cErr } = await supabaseAdmin
        .from("ceo_conversations")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);
      convId = conv.id;
    }

    // Save user message
    await supabaseAdmin.from("ceo_chat_messages").insert({
      user_id: userId,
      conversation_id: convId,
      role: "user",
      content: data.content,
    });

    const runStarted = Date.now();

    // Fan out in parallel — one draft per unit (per role, if agents mode)
    const drafts: DraftResult[] = await Promise.all(
      units.map(async (u) => {
        const r = await draftOne(u.model, data.content, u.systemPrompt);
        return { ...r, role: u.role, roleLabel: u.roleLabel };
      }),
    );
    const okDrafts = drafts.filter((d) => d.status === "ok");
    const models = units.map((u) => u.model);


    let finalContent = "";
    let synthLabel = LABEL_BY_SLUG.get(synthModel) ?? synthModel;
    let swarmStatus: "ok" | "degraded" | "failed" = "ok";

    if (okDrafts.length === 0) {
      finalContent = `_Swarm failed — all ${drafts.length} models errored._\n\n` +
        drafts.map((d) => `- **${d.label}**: ${d.error}`).join("\n");
      swarmStatus = "failed";
    } else {
      if (okDrafts.length < drafts.length) swarmStatus = "degraded";
      const draftBlock = okDrafts
        .map((d, i) => {
          const header = d.roleLabel ? `${d.roleLabel} · ${d.label}` : d.label;
          return `## Draft ${String.fromCharCode(65 + i)} (${header})\n\n${d.content}`;
        })
        .join("\n\n---\n\n");
      try {
        const synthJson = await chatCompletion({
          model: resolveTextChatModel(synthModel),
          temperature: 0.3,
          messages: [
            { role: "system", content: SYNTH_SYSTEM },
            {
              role: "user",
              content: `USER PROMPT:\n${data.content}\n\n---\n\n${okDrafts.length} INDEPENDENT DRAFTS:\n\n${draftBlock}\n\n---\n\nProduce the final, unified answer now.`,
            },
          ],
        });
        finalContent = synthJson?.choices?.[0]?.message?.content?.trim() ||
          okDrafts[0].content;
      } catch (e: any) {
        // Synth failed → return the strongest draft
        finalContent = okDrafts[0].content +
          `\n\n---\n_(Synthesizer ${synthLabel} failed: ${e?.message ?? "error"} — showing strongest draft.)_`;
        swarmStatus = "degraded";
      }
    }

    // Save assistant message
    const { data: savedMsg, error: mErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({
        user_id: userId,
        conversation_id: convId,
        role: "assistant",
        content: finalContent,
      })
      .select("id, role, content, created_at, conversation_id")
      .single();
    if (mErr) throw new Error(mErr.message);

    // Persist run + drafts
    const { data: runRow, error: rErr } = await supabaseAdmin
      .from("swarm_runs")
      .insert({
        user_id: userId,
        conversation_id: convId,
        message_id: savedMsg.id,
        synth_model: synthModel,
        drafter_models: models,
        status: swarmStatus,
        latency_ms: Date.now() - runStarted,
      })
      .select("id")
      .single();
    if (!rErr && runRow) {
      await supabaseAdmin.from("swarm_drafts").insert(
        drafts.map((d) => ({
          run_id: runRow.id,
          user_id: userId,
          model_slug: d.model,
          model_label: d.label,
          role: d.role ?? null,
          role_label: d.roleLabel ?? null,
          content: d.content,
          status: d.status,
          error: d.error ?? null,
          latency_ms: d.latency_ms,
          tokens_in: d.tokens_in ?? null,
          tokens_out: d.tokens_out ?? null,
        })),
      );
    }

    await supabaseAdmin
      .from("ceo_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", convId);

    return {
      ...savedMsg,
      swarm_run_id: runRow?.id ?? null,
      swarm_synth_model: synthModel,
      swarm_synth_label: synthLabel,
      swarm_status: swarmStatus,
      swarm_drafter_count: models.length,
    };
  });

// ── Fetch drafts for the accordion ─────────────────────────────────────────
export const getSwarmDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => ({ runId: String(d?.runId ?? "") }))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    if (!data.runId) return { drafts: [], run: null };
    const [{ data: run }, { data: drafts }] = await Promise.all([
      supabase
        .from("swarm_runs")
        .select("id,synth_model,drafter_models,status,latency_ms,created_at,message_id")
        .eq("id", data.runId)
        .maybeSingle(),
      supabase
        .from("swarm_drafts")
        .select("id,model_slug,model_label,role,role_label,content,status,error,latency_ms,tokens_in,tokens_out")
        .eq("run_id", data.runId)
        .order("created_at", { ascending: true }),
    ]);
    return { run, drafts: drafts ?? [] };
  });

// Return swarm_run_id map for a conversation so the client can decorate rows.
export const getSwarmRunsForConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string | null }) => ({
    conversationId: d?.conversationId ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    if (!data.conversationId) return [] as Array<{ message_id: string; id: string; synth_model: string; drafter_models: string[]; status: string }>;
    const { data: rows } = await supabase
      .from("swarm_runs")
      .select("id,message_id,synth_model,drafter_models,status")
      .eq("conversation_id", data.conversationId);
    return (rows ?? []) as Array<{ message_id: string; id: string; synth_model: string; drafter_models: string[]; status: string }>;
  });
