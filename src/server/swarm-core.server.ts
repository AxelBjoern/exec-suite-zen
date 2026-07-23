// Server-only swarm primitives. Kept out of `swarm.functions.ts` because
// that file is reachable from the client bundle (routes import server-fn
// wrappers from it), and the import-protection plugin blocks any file that
// pulls `@/lib/llm.server` at module scope into the client graph.
import { chatCompletion, resolveTextChatModel } from "@/lib/llm.server";
import { LABEL_BY_SLUG, type SwarmRole } from "@/serverfns/swarm.functions";

export type DraftResult = {
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
  attempted_models: string[];
  used_fallback: boolean;
  primary_error?: string;
};

export const PRIMARY_TIMEOUT_MS = 100_000;
export const FALLBACK_TIMEOUT_MS = 45_000;
export const DEFAULT_FALLBACK_MODEL = "deepseek/deepseek-v4-flash";

export const SYNTH_SYSTEM = `You are the arbiter of a multi-model swarm. You will receive several independent drafts written by other AI models in response to the same user prompt. Your job is to produce ONE final answer that is strictly better than any single draft: more accurate, more complete, better structured, and better calibrated in tone.

Rules:
- Silently reconcile disagreements. If a claim is contested and material, note the disagreement briefly ("sources differ on X"), don't pretend consensus.
- Prefer verifiable specifics over vague generalities. Drop hallucinations.
- Keep the strongest reasoning, examples, and structure from across the drafts. Do not lose useful detail.
- Do not mention the drafts, the models, "draft A", or the swarm process. Write as one coherent voice.
- Match the user's requested length/format. If they asked for markdown, code, or a list, deliver that.
- If drafts are all weak, answer from your own capability rather than parroting them.`;

export type ImagePart = { type: "image_url"; image_url: { url: string } };

// Models that cannot process image inputs. Used to skip drafts cleanly
// when images are attached instead of failing the whole swarm.
const NO_VISION_MODELS = new Set<string>([
  "nousresearch/hermes-4-405b",
]);

function buildUserContent(text: string, imageParts: ImagePart[] | undefined) {
  if (!imageParts || imageParts.length === 0) return text;
  return [{ type: "text" as const, text }, ...imageParts];
}

async function attemptDraft(
  model: string,
  userContent: string,
  systemPrompt: string,
  timeoutMs: number,
  imageParts?: ImagePart[],
): Promise<{ ok: true; content: string; tokens_in?: number; tokens_out?: number } | { ok: false; error: string }> {
  try {
    const json = await Promise.race([
      chatCompletion({
        model: resolveTextChatModel(model),
        temperature: 0.6,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildUserContent(userContent, imageParts) as any },
        ],
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    const content = json?.choices?.[0]?.message?.content?.trim() || "";
    if (!content) return { ok: false, error: "empty response" };
    return {
      ok: true,
      content,
      tokens_in: json?.usage?.prompt_tokens,
      tokens_out: json?.usage?.completion_tokens,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function draftOne(
  model: string,
  userContent: string,
  systemPrompt: string,
  opts?: { fallbackModel?: string | null; timeoutMs?: number; fallbackTimeoutMs?: number; imageParts?: ImagePart[] },
): Promise<DraftResult> {
  const label = LABEL_BY_SLUG.get(model) ?? model;
  const started = Date.now();
  const timeoutMs = Math.min(180_000, Math.max(15_000, opts?.timeoutMs ?? PRIMARY_TIMEOUT_MS));
  const fallbackTimeoutMs = Math.min(120_000, Math.max(15_000, opts?.fallbackTimeoutMs ?? FALLBACK_TIMEOUT_MS));
  const requestedFallback = opts?.fallbackModel && opts.fallbackModel !== model ? opts.fallbackModel : null;
  const imageParts = opts?.imageParts;
  const hasImages = !!imageParts && imageParts.length > 0;
  const attempted: string[] = [model];

  // Skip vision-incapable models cleanly when images are attached so the
  // rest of the swarm still runs.
  if (hasImages && NO_VISION_MODELS.has(model)) {
    const fb = requestedFallback && !NO_VISION_MODELS.has(requestedFallback) ? requestedFallback : null;
    if (!fb) {
      return {
        model,
        label,
        status: "error",
        content: "",
        error: `${label} cannot read images. Pick a vision-capable fallback (Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, or DeepSeek V4 Pro).`,
        latency_ms: Date.now() - started,
        attempted_models: attempted,
        used_fallback: false,
        primary_error: "no_vision",
      };
    }
    attempted.push(fb);
    const fbLabel = LABEL_BY_SLUG.get(fb) ?? fb;
    const fbRes = await attemptDraft(fb, userContent, systemPrompt, fallbackTimeoutMs, imageParts);
    if (fbRes.ok) {
      return {
        model: fb, label: fbLabel, status: "ok", content: fbRes.content,
        latency_ms: Date.now() - started, tokens_in: fbRes.tokens_in, tokens_out: fbRes.tokens_out,
        attempted_models: attempted, used_fallback: true, primary_error: "no_vision",
      };
    }
    return {
      model, label, status: "error", content: "",
      error: `${label} has no vision → fallback ${fbLabel}: ${fbRes.error}`,
      latency_ms: Date.now() - started, attempted_models: attempted, used_fallback: true, primary_error: "no_vision",
    };
  }

  const fallback = requestedFallback;
  const primary = await attemptDraft(model, userContent, systemPrompt, timeoutMs, imageParts);
  if (primary.ok) {
    return {
      model,
      label,
      status: "ok",
      content: primary.content,
      latency_ms: Date.now() - started,
      tokens_in: primary.tokens_in,
      tokens_out: primary.tokens_out,
      attempted_models: attempted,
      used_fallback: false,
    };
  }

  if (fallback) {
    attempted.push(fallback);
    const fbLabel = LABEL_BY_SLUG.get(fallback) ?? fallback;
    const fb = await attemptDraft(fallback, userContent, systemPrompt, fallbackTimeoutMs, imageParts);
    if (fb.ok) {
      return {
        model: fallback,
        label: fbLabel,
        status: "ok",
        content: fb.content,
        latency_ms: Date.now() - started,
        tokens_in: fb.tokens_in,
        tokens_out: fb.tokens_out,
        attempted_models: attempted,
        used_fallback: true,
        primary_error: primary.error,
      };
    }
    return {
      model,
      label,
      status: "error",
      content: "",
      error: `${primary.error} → fallback ${fbLabel}: ${fb.error}`,
      latency_ms: Date.now() - started,
      attempted_models: attempted,
      used_fallback: true,
      primary_error: primary.error,
    };
  }

  return {
    model,
    label,
    status: "error",
    content: "",
    error: primary.error,
    latency_ms: Date.now() - started,
    attempted_models: attempted,
    used_fallback: false,
    primary_error: primary.error,
  };
}

export async function synthesize(
  synthModel: string,
  userPrompt: string,
  draftBlock: string,
): Promise<string> {
  const json = await chatCompletion({
    model: resolveTextChatModel(synthModel),
    temperature: 0.3,
    messages: [
      { role: "system", content: SYNTH_SYSTEM },
      {
        role: "user",
        content: `USER PROMPT:\n${userPrompt}\n\n---\n\nINDEPENDENT DRAFTS:\n\n${draftBlock}\n\n---\n\nProduce the final, unified answer now.`,
      },
    ],
  });
  return json?.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── Quality-breakdown synth ────────────────────────────────────────────────
// Produces the final answer PLUS a per-draft judgment: confidence 0-100 and
// a one-sentence rationale describing how each draft contributed (or why it
// was discounted). Used to render the quality breakdown UI on swarm replies.
export type DraftBreakdown = {
  id: string;              // "A", "B", ...
  model: string;
  label: string;
  confidence: number;      // 0-100
  rationale: string;
};

const SYNTH_BREAKDOWN_SYSTEM = `${SYNTH_SYSTEM}

ADDITIONAL OUTPUT REQUIREMENT:
Return ONE JSON object, no prose outside JSON, matching:
{
  "answer": "the final unified answer as a single string (markdown allowed)",
  "breakdown": [
    { "id": "A", "confidence": 0-100, "rationale": "one short sentence explaining how much of A you kept / why" }
  ]
}
- Include one breakdown entry for every draft you were given, in the same A/B/C order.
- confidence = how much this draft contributed to the final answer AND how trustworthy its claims were (100 = fully relied on, 0 = discarded).
- rationale is one sentence, direct, no fluff.
- The "answer" field must still be the full final answer you would have written normally — do not shorten it just because it's inside JSON.`;

export async function synthesizeWithBreakdown(
  synthModel: string,
  userPrompt: string,
  drafts: Array<Pick<DraftResult, "model" | "label" | "content">>,
): Promise<{ answer: string; breakdown: DraftBreakdown[] }> {
  const labeled = drafts.map((d, i) => ({
    id: String.fromCharCode(65 + i),
    ...d,
  }));
  const draftBlock = labeled
    .map((l) => `## Draft ${l.id} (${l.label})\n\n${l.content}`)
    .join("\n\n---\n\n");
  const json = await chatCompletion({
    model: resolveTextChatModel(synthModel),
    temperature: 0.2,
    messages: [
      { role: "system", content: SYNTH_BREAKDOWN_SYSTEM },
      {
        role: "user",
        content: `USER PROMPT:\n${userPrompt}\n\n---\n\n${labeled.length} INDEPENDENT DRAFTS:\n\n${draftBlock}\n\n---\n\nReturn the JSON now.`,
      },
    ],
  });
  const raw = json?.choices?.[0]?.message?.content?.trim() ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed: any = null;
  if (match) {
    try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
  }
  const answer = typeof parsed?.answer === "string" && parsed.answer.trim()
    ? parsed.answer.trim()
    : raw; // fallback: use raw text as the answer
  const breakdownIn: any[] = Array.isArray(parsed?.breakdown) ? parsed.breakdown : [];
  const breakdown: DraftBreakdown[] = labeled.map((l) => {
    const hit = breakdownIn.find((b) => String(b?.id).toUpperCase() === l.id);
    const conf = Number(hit?.confidence);
    return {
      id: l.id,
      model: l.model,
      label: l.label,
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : 0,
      rationale: typeof hit?.rationale === "string" ? hit.rationale.trim() : "",
    };
  });
  return { answer, breakdown };
}
