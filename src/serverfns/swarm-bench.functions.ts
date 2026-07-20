// Swarm benchmarking: run the same prompt through each drafter individually
// plus the current swarm config, score each result with the synthesizer as
// arbiter, estimate cost, and persist to swarm_bench_runs for comparison.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// `@/server/llm.server` cannot be imported at module scope: swarm-bench.tsx
// pulls this file into the client graph and the import-protection plugin
// blocks any `.server` imports from client-reachable modules. Load lazily.
let _llmModPromise: Promise<typeof import("@/server/llm.server")> | null = null;
async function llm() {
  if (!_llmModPromise) _llmModPromise = import("@/server/llm.server");
  return _llmModPromise;
}
async function chatCompletion(...args: Parameters<Awaited<ReturnType<typeof llm>>["chatCompletion"]>) {
  return (await llm()).chatCompletion(...args);
}
async function resolveTextChatModel(id?: string | null): Promise<string> {
  return (await llm()).resolveTextChatModel(id);
}
import {
  ALLOWED_SWARM_MODELS,
  DEFAULT_SWARM_MODELS,
  DEFAULT_SYNTH_MODEL,
  DEFAULT_MAX_PARALLEL,
} from "./swarm.functions";

const LABEL_BY_SLUG = new Map(ALLOWED_SWARM_MODELS.map((m) => [m.slug, m.label] as const));

// Rough per-1K-token credit prices (input+output blended). Tuned for the
// 8 allowed models; treat as an estimate, not billing truth.
const PRICE_PER_1K: Record<string, { in: number; out: number }> = {
  "anthropic/claude-opus-4.7": { in: 15, out: 75 },
  "openai/gpt-5.3-chat": { in: 5, out: 15 },
  "x-ai/grok-4.3": { in: 5, out: 15 },
  "nousresearch/hermes-4-405b": { in: 2, out: 6 },
  "deepseek/deepseek-v4-pro": { in: 1.5, out: 4 },
  "deepseek/deepseek-v4-flash": { in: 0.3, out: 1 },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": { in: 0, out: 0 },
  "kwaivgi/kling-v3.0-std": { in: 0, out: 0 },
};

function estimateCost(model: string, tin = 0, tout = 0): number {
  const p = PRICE_PER_1K[model] ?? { in: 1, out: 3 };
  return +(((tin * p.in) + (tout * p.out)) / 1000).toFixed(4);
}

type Row = {
  model: string;
  label: string;
  status: "ok" | "error";
  content: string;
  error?: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_credits: number;
  quality_score?: number | null;
};

async function runOne(model: string, prompt: string): Promise<Row> {
  const label = LABEL_BY_SLUG.get(model) ?? model;
  const started = Date.now();
  try {
    const json = await chatCompletion({
      model: resolveTextChatModel(model),
      temperature: 0.6,
      messages: [
        { role: "system", content: "You are a top-tier assistant. Give the best answer you can. Be specific, correct, useful." },
        { role: "user", content: prompt },
      ],
    });
    const content = json?.choices?.[0]?.message?.content?.trim() || "";
    const tin = Number(json?.usage?.prompt_tokens ?? 0);
    const tout = Number(json?.usage?.completion_tokens ?? 0);
    return {
      model, label, status: "ok", content,
      latency_ms: Date.now() - started,
      tokens_in: tin, tokens_out: tout,
      cost_credits: estimateCost(model, tin, tout),
    };
  } catch (e: any) {
    return {
      model, label, status: "error", content: "",
      error: e?.message ?? String(e),
      latency_ms: Date.now() - started,
      tokens_in: 0, tokens_out: 0, cost_credits: 0,
    };
  }
}

const SCORING_SYSTEM = `You are a strict, calibrated evaluator. Rate each candidate answer to the given prompt on a 1-5 rubric across:
- accuracy (facts correct, no hallucination)
- completeness (covers the ask)
- reasoning (clear, sound)
- style (clarity, structure, tone appropriate to the ask)

Return STRICT JSON only, no prose:
{"scores":[{"id":"A","score":1-5,"reason":"one short sentence"}, ...]}
Score honestly — differentiate. Do not average to the middle.`;

async function scoreRows(synthModel: string, prompt: string, rows: Row[]): Promise<Row[]> {
  const oks = rows.filter((r) => r.status === "ok" && r.content);
  if (oks.length === 0) return rows;
  const labeled = oks.map((r, i) => ({ id: String.fromCharCode(65 + i), row: r }));
  const block = labeled
    .map((l) => `## Candidate ${l.id} (${l.row.label})\n\n${l.row.content}`)
    .join("\n\n---\n\n");
  try {
    const json = await chatCompletion({
      model: resolveTextChatModel(synthModel),
      temperature: 0,
      messages: [
        { role: "system", content: SCORING_SYSTEM },
        { role: "user", content: `PROMPT:\n${prompt}\n\n---\n\nCANDIDATES:\n\n${block}` },
      ],
    });
    const raw = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return rows;
    const parsed = JSON.parse(match[0]);
    const byId = new Map<string, number>();
    for (const s of parsed?.scores ?? []) {
      if (typeof s?.id === "string" && typeof s?.score === "number") {
        byId.set(s.id, Math.max(1, Math.min(5, s.score)));
      }
    }
    for (const l of labeled) {
      const s = byId.get(l.id);
      if (typeof s === "number") l.row.quality_score = s;
    }
  } catch {
    // scoring failed — leave rows unscored
  }
  return rows;
}

export const runSwarmBench = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; label?: string }) => {
    const p = (d?.prompt ?? "").trim();
    if (!p) throw new Error("Prompt required");
    if (p.length > 4000) throw new Error("Prompt too long (max 4000)");
    return { prompt: p, label: (d?.label ?? "").slice(0, 120) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Load user's current swarm config
    const { data: cfg } = await supabase
      .from("user_settings")
      .select("swarm_models,swarm_synth_model,swarm_max_parallel,swarm_agents")
      .eq("user_id", userId)
      .maybeSingle();

    const synthModel = cfg?.swarm_synth_model || DEFAULT_SYNTH_MODEL;
    const maxParallel = Math.min(6, Math.max(2, cfg?.swarm_max_parallel ?? DEFAULT_MAX_PARALLEL));

    // Prefer the active per-role agents; otherwise the drafters list.
    const agents = Array.isArray(cfg?.swarm_agents) ? cfg.swarm_agents : [];
    const agentModels = agents
      .filter((a: any) => a?.enabled && typeof a?.model === "string")
      .map((a: any) => a.model);
    const drafterList: string[] = (agentModels.length >= 2
      ? agentModels
      : (Array.isArray(cfg?.swarm_models) && cfg.swarm_models.length >= 2
          ? cfg.swarm_models
          : DEFAULT_SWARM_MODELS)
    ).slice(0, maxParallel);

    const started = Date.now();

    // Fan out drafters in parallel
    const drafterRows = await Promise.all(drafterList.map((m) => runOne(m, data.prompt)));

    // Synthesize a "swarm" answer from ok drafts
    const oks = drafterRows.filter((r) => r.status === "ok");
    let swarmRow: Row = {
      model: `swarm:${synthModel}`,
      label: `Swarm (${LABEL_BY_SLUG.get(synthModel) ?? synthModel})`,
      status: "error",
      content: "",
      error: "no successful drafts",
      latency_ms: 0,
      tokens_in: 0,
      tokens_out: 0,
      cost_credits: 0,
    };
    if (oks.length >= 1) {
      const synthStart = Date.now();
      try {
        const draftBlock = oks
          .map((d, i) => `## Draft ${String.fromCharCode(65 + i)} (${d.label})\n\n${d.content}`)
          .join("\n\n---\n\n");
        const json = await chatCompletion({
          model: resolveTextChatModel(synthModel),
          temperature: 0.3,
          messages: [
            { role: "system", content: "You are the arbiter. Merge the drafts into one final answer that is more accurate, complete, and useful than any individual draft. Never mention the drafts or model names." },
            { role: "user", content: `USER PROMPT:\n${data.prompt}\n\n---\n\nDRAFTS:\n\n${draftBlock}\n\n---\n\nFinal answer:` },
          ],
        });
        const content = json?.choices?.[0]?.message?.content?.trim() || "";
        const tin = Number(json?.usage?.prompt_tokens ?? 0);
        const tout = Number(json?.usage?.completion_tokens ?? 0);
        swarmRow = {
          model: `swarm:${synthModel}`,
          label: `Swarm (${LABEL_BY_SLUG.get(synthModel) ?? synthModel})`,
          status: "ok",
          content,
          latency_ms: Date.now() - synthStart,
          tokens_in: tin,
          tokens_out: tout,
          cost_credits: estimateCost(synthModel, tin, tout),
        };
      } catch (e: any) {
        swarmRow.error = e?.message ?? "synth failed";
      }
    }

    // Score all candidates (drafters + swarm)
    const allRows = [...drafterRows, swarmRow];
    await scoreRows(synthModel, data.prompt, allRows);

    // Aggregate metrics
    const drafterCost = drafterRows.reduce((s, r) => s + r.cost_credits, 0);
    const totalCost = +(drafterCost + swarmRow.cost_credits).toFixed(4);
    const totalTin = drafterRows.reduce((s, r) => s + r.tokens_in, 0) + swarmRow.tokens_in;
    const totalTout = drafterRows.reduce((s, r) => s + r.tokens_out, 0) + swarmRow.tokens_out;
    const latency = Date.now() - started;
    const swarmQ = swarmRow.quality_score ?? null;

    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await (admin as any)
      .from("swarm_bench_runs")
      .insert({
        user_id: userId,
        label: data.label || null,
        prompt: data.prompt,
        drafter_models: drafterList,
        synth_model: synthModel,
        latency_ms: latency,
        tokens_in: totalTin,
        tokens_out: totalTout,
        cost_credits: totalCost,
        quality_score: swarmQ,
        per_model: allRows.map((r) => ({
          model: r.model,
          label: r.label,
          status: r.status,
          latency_ms: r.latency_ms,
          tokens_in: r.tokens_in,
          tokens_out: r.tokens_out,
          cost_credits: r.cost_credits,
          quality_score: r.quality_score ?? null,
          error: r.error ?? null,
          content: r.content ?? "",
        })),
        final_answer: swarmRow.content || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listSwarmBenchRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("swarm_bench_runs")
      .select("id,label,prompt,drafter_models,synth_model,latency_ms,tokens_in,tokens_out,cost_credits,quality_score,per_model,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSwarmBenchRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (!data.id) throw new Error("id required");
    const { data: row, error } = await supabase
      .from("swarm_bench_runs")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSwarmBenchRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (!data.id) throw new Error("id required");
    const { error } = await supabase
      .from("swarm_bench_runs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
