// All LLM calls go through OpenRouter. Server-only.
// Reads OPENROUTER_API_KEY from process.env. No fallback models — if a
// selected model fails, the error surfaces with that model's name.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Default text model. Must be tool-capable on OpenRouter — Hermes 4 405B
// currently has no tool-capable endpoint, so we use Grok 4.3 (which is also
// what a video-model selection falls back to for @-mention dispatch).
const DEFAULT_MODEL = "x-ai/grok-4.3";
const DEFAULT_MAX_TOKENS = 8000;
const RETRY_MAX_TOKENS = 12000;

// The ONLY allowed models. No other versions, no fallbacks.
const MODEL_SLUGS = {
  hermes: "nousresearch/hermes-4-405b",
  grok: "x-ai/grok-4.3",
  gpt: "openai/gpt-5.3-chat",
  claude: "anthropic/claude-opus-4.7",
  deepseek: "deepseek/deepseek-v4-pro",
  "deepseek-flash": "deepseek/deepseek-v4-flash",
  kling: "kwaivgi/kling-v3.0-std",
} as const;

const MODEL_LABELS: Record<string, string> = {
  "nousresearch/hermes-4-405b": "Hermes 4 405B",
  "x-ai/grok-4.3": "Grok 4.3",
  "openai/gpt-5.3-chat": "ChatGPT 5.3",
  "anthropic/claude-opus-4.7": "Claude Opus 4.7",
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
  "kwaivgi/kling-v3.0-std": "Kling v3.0 Std",
};

// Video-generation models. These don't use chat completions — callers must
// route them through a video-generation path instead.
export const VIDEO_MODEL_SLUGS = new Set<string>(["kwaivgi/kling-v3.0-std"]);

export function isVideoModel(slug: string): boolean {
  return VIDEO_MODEL_SLUGS.has(slug);
}

export function resolveChatModel(id?: string | null): string {
  if (!id) return DEFAULT_MODEL;
  if (MODEL_LABELS[id]) return id;
  const slug = MODEL_SLUGS[id as keyof typeof MODEL_SLUGS];
  if (!slug) throw new Error(`Unknown model "${id}". Allowed: Hermes 4 405B, Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, DeepSeek V4 Pro, DeepSeek V4 Flash, Kling v3.0 Std.`);
  return slug;
}

export function resolveTextChatModel(id?: string | null): string {
  const slug = resolveChatModel(id);
  return isVideoModel(slug) ? DEFAULT_MODEL : slug;
}

function labelFor(slug: string): string {
  return MODEL_LABELS[slug] ?? "the selected model";
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  tools?: any[];
  tool_choice?: "auto" | { type: "function"; function: { name: string } };
  temperature?: number;
  model?: string;
  max_tokens?: number;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  const model = opts.model ?? DEFAULT_MODEL;
  const label = labelFor(model);
  if (isVideoModel(model)) {
    throw new Error(`${label} is a video-generation model and can't be used for chat. Pick a text model to chat, or trigger video generation explicitly.`);
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lovable.app",
      "X-Title": "VDNX Agents",
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      max_tokens: opts.max_tokens ?? DEFAULT_MAX_TOKENS,
      ...(opts.tools?.length
        ? {
            tools: opts.tools,
            tool_choice: opts.tool_choice ?? "auto",
            provider: { require_parameters: true },
          }
        : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error(`${label} is rate-limited. Wait a moment and retry.`);
    if (res.status === 402) throw new Error(`Credits exhausted while calling ${label}.`);
    if (res.status === 401) throw new Error("OPENROUTER_API_KEY invalid or revoked.");
    const noToolEndpoint =
      res.status === 404 && opts.tools?.length && /tool use|require_parameters/i.test(body);
    if (noToolEndpoint) {
      throw new Error(`${label} has no tool-capable endpoint right now. Pick another model.`);
    }
    throw new Error(`${label} request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────
// JSON repair for truncated/malformed tool-call arguments
// ─────────────────────────────────────────────────────────────────────────

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Attempt to close an unterminated JSON string by walking the text and
 * tracking quotes, escapes, and bracket/brace depth. Returns a best-effort
 * closed version of `s`. Not perfect but handles the common case where the
 * model was cut off mid-array.
 */
function repairJson(input: string): string {
  let s = stripFences(input)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // Walk to find structural state at end-of-string.
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastNonWs = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!/\s/.test(ch)) lastNonWs = i;
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}") { if (stack[stack.length - 1] === "{") stack.pop(); }
    else if (ch === "]") { if (stack[stack.length - 1] === "[") stack.pop(); }
  }

  // Close an unterminated string.
  if (inString) s += '"';

  // Drop a trailing dangling comma or partial token before closing.
  // e.g. `..."foo",` or `..."fo` -> trim to last complete element.
  // Simplest heuristic: trim trailing whitespace then trailing comma.
  s = s.replace(/[\s,]+$/g, "");

  // Close remaining open structures in reverse.
  while (stack.length) {
    const open = stack.pop();
    s += open === "{" ? "}" : "]";
  }

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  return s;
}

function tryParse(raw: string): { ok: true; value: any } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e: any) {
    try {
      return { ok: true, value: JSON.parse(repairJson(raw)) };
    } catch (e2: any) {
      return { ok: false, error: e2 };
    }
  }
}

function snippetAround(s: string, pos: number, span = 80): string {
  const start = Math.max(0, pos - span);
  const end = Math.min(s.length, pos + span);
  return `…${s.slice(start, end).replace(/\s+/g, " ")}…`;
}

function extractFirstToolCall(json: any) {
  const choice = json?.choices?.[0];
  const call = choice?.message?.tool_calls?.[0];
  const finish = choice?.finish_reason ?? null;
  return { call, finish };
}

/** Convenience: structured tool call (one or more tools, returns first tool_call). */
export async function callTool<T>(opts: {
  system: string;
  user: string;
  tool?: any;
  tools?: any[];
  toolChoice?: "auto" | { name: string };
  model?: string;
}): Promise<{ name: string; result: T }> {
  const tools = opts.tools ?? (opts.tool ? [opts.tool] : []);
  const tool_choice =
    opts.toolChoice === "auto"
      ? "auto"
      : opts.toolChoice
        ? ({ type: "function" as const, function: { name: opts.toolChoice.name } })
        : tools.length === 1
          ? ({ type: "function" as const, function: { name: tools[0].function.name } })
          : "auto";

  const model = opts.model ?? DEFAULT_MODEL;
  const label = labelFor(model);

  const baseMessages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  // First attempt.
  let json = await chatCompletion({
    messages: baseMessages,
    tools,
    tool_choice,
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
  });
  let { call, finish } = extractFirstToolCall(json);

  // If truncated by length OR no tool call at all, retry once with more room
  // and a compactness nudge.
  const truncated = finish === "length";
  if (truncated || !call?.function?.arguments) {
    const retryMessages: ChatMessage[] = [
      { role: "system", content: `${opts.system}\n\nIMPORTANT: Return compact JSON. Keep each body_md under 350 words. Maximum 6 action_items. Maximum 4 sections. Do not pad.` },
      { role: "user", content: opts.user },
    ];
    json = await chatCompletion({
      messages: retryMessages,
      tools,
      tool_choice,
      model,
      max_tokens: RETRY_MAX_TOKENS,
    });
    ({ call, finish } = extractFirstToolCall(json));
  }

  if (!call?.function?.arguments) {
    throw new Error(`${label} did not return a structured tool call (finish_reason: ${finish ?? "unknown"}).`);
  }

  const raw = call.function.arguments as string;
  const parsed = tryParse(raw);
  if (!parsed.ok) {
    // Last-resort retry if first attempt wasn't already a retry.
    if (!truncated) {
      const retryMessages: ChatMessage[] = [
        { role: "system", content: `${opts.system}\n\nIMPORTANT: Return compact, valid JSON. Keep each body_md under 350 words. Maximum 6 action_items. Maximum 4 sections.` },
        { role: "user", content: opts.user },
      ];
      const json2 = await chatCompletion({
        messages: retryMessages,
        tools,
        tool_choice,
        model,
        max_tokens: RETRY_MAX_TOKENS,
      });
      const { call: call2, finish: finish2 } = extractFirstToolCall(json2);
      if (call2?.function?.arguments) {
        const parsed2 = tryParse(call2.function.arguments);
        if (parsed2.ok) {
          return { name: call2.function.name, result: parsed2.value as T };
        }
        const m = /position (\d+)/.exec(parsed2.error.message);
        const pos = m ? parseInt(m[1], 10) : (call2.function.arguments as string).length;
        throw new Error(
          `${label} returned malformed JSON after retry (finish_reason: ${finish2 ?? "unknown"}, ${(call2.function.arguments as string).length} chars). Near: ${snippetAround(call2.function.arguments as string, pos)}`,
        );
      }
    }
    const m = /position (\d+)/.exec(parsed.error.message);
    const pos = m ? parseInt(m[1], 10) : raw.length;
    throw new Error(
      `${label} returned malformed JSON (finish_reason: ${finish ?? "unknown"}, ${raw.length} chars). Near: ${snippetAround(raw, pos)}`,
    );
  }

  return { name: call.function.name, result: parsed.value as T };
}
