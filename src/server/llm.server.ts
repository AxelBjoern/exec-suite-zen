// All LLM calls go through OpenRouter. Server-only.
// Reads OPENROUTER_API_KEY from process.env. No fallback models — if a
// selected model fails, the error surfaces with that model's name.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nousresearch/hermes-4-405b";

// The ONLY allowed models. No other versions, no fallbacks.
const MODEL_SLUGS = {
  hermes: "nousresearch/hermes-4-405b",
  grok: "x-ai/grok-4.3",
  gpt: "openai/gpt-5.3-chat",
  claude: "anthropic/claude-opus-4.7",
  deepseek: "deepseek/deepseek-v4-pro",
} as const;

const MODEL_LABELS: Record<string, string> = {
  "nousresearch/hermes-4-405b": "Hermes 4 405B",
  "x-ai/grok-4.3": "Grok 4.3",
  "openai/gpt-5.3-chat": "ChatGPT 5.3",
  "anthropic/claude-opus-4.7": "Claude Opus 4.7",
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
};

export function resolveChatModel(id?: string | null): string {
  if (!id) return DEFAULT_MODEL;
  const slug = MODEL_SLUGS[id as keyof typeof MODEL_SLUGS];
  if (!slug) throw new Error(`Unknown model "${id}". Allowed: Hermes 4 405B, Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, DeepSeek V4 Pro.`);
  return slug;
}

function labelFor(slug: string): string {
  return MODEL_LABELS[slug] ?? "the selected model";
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  tools?: any[];
  tool_choice?: "auto" | { type: "function"; function: { name: string } };
  temperature?: number;
  model?: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  const model = opts.model ?? DEFAULT_MODEL;
  const label = labelFor(model);

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

  const json = await chatCompletion({
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    tools,
    tool_choice,
    model: opts.model,
  });

  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    const label = labelFor(opts.model ?? DEFAULT_MODEL);
    throw new Error(`${label} did not return a structured tool call.`);
  }
  try {
    return { name: call.function.name, result: JSON.parse(call.function.arguments) as T };
  } catch (e: any) {
    throw new Error(`Failed to parse tool args: ${e.message}`);
  }
}
