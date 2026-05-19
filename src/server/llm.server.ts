// Hermes via OpenRouter — replaces the Lovable AI Gateway for all agent calls.
// Server-only. Reads OPENROUTER_API_KEY from process.env.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = process.env.HERMES_MODEL ?? "nousresearch/hermes-4-405b";

// User-facing model picker → OpenRouter slug.
// Version numbers in labels mirror what the operator asked for; slugs are the
// closest currently-published OpenRouter models. Update slugs when newer
// versions ship.
export const CHAT_MODEL_OPTIONS = [
  { id: "hermes", label: "Hermes 4 405B", slug: "nousresearch/hermes-4-405b" },
  { id: "grok", label: "Grok 4.3", slug: "x-ai/grok-4" },
  { id: "gpt", label: "ChatGPT 5.3", slug: "openai/gpt-5" },
  { id: "claude", label: "Claude Opus 4.7", slug: "anthropic/claude-opus-4.1" },
  { id: "deepseek", label: "DeepSeek V4 Pro", slug: "deepseek/deepseek-chat" },
] as const;

export type ChatModelId = (typeof CHAT_MODEL_OPTIONS)[number]["id"];

export function resolveChatModel(id?: string | null): string {
  if (!id) return DEFAULT_MODEL;
  const hit = CHAT_MODEL_OPTIONS.find((m) => m.id === id);
  return hit?.slug ?? DEFAULT_MODEL;
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

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lovable.app",
      "X-Title": "VDNX Agents",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages: opts.messages,
      ...(opts.tools?.length ? { tools: opts.tools, tool_choice: opts.tool_choice ?? "auto" } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Hermes rate limit reached. Wait a moment and retry.");
    if (res.status === 402) throw new Error("OpenRouter credits exhausted. Top up at openrouter.ai.");
    if (res.status === 401) throw new Error("OPENROUTER_API_KEY invalid or revoked.");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 500)}`);
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
    throw new Error("Hermes did not return a structured tool call");
  }
  try {
    return { name: call.function.name, result: JSON.parse(call.function.arguments) as T };
  } catch (e: any) {
    throw new Error(`Failed to parse tool args: ${e.message}`);
  }
}
