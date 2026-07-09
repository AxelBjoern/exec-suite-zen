// Outbound intent classifier — server-only helper used by chat.
// Uses OpenRouter via src/server/llm.server.ts (project memory rule).
import { callTool } from "@/server/llm.server";

export type OutboundAction = "file" | "generate" | "unknown";

export type OutboundIntent =
  | { kind: "none" }
  | { kind: "email"; action: OutboundAction; to?: string; subject?: string; body?: string; missing?: string[] }
  | { kind: "reminder"; action: OutboundAction; subject?: string; body?: string; missing?: string[] }
  | { kind: "linkedin"; action: OutboundAction; text?: string; missing?: string[] };

const TOOL = {
  type: "function" as const,
  function: {
    name: "classify_outbound",
    description:
      "Detect if the user is DISPATCHING an existing piece of outbound content (email, LinkedIn post, reminder). Authoring/drafting requests are NOT dispatch — return kind='none' for those.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["none", "email", "reminder", "linkedin"] },
        action: {
          type: "string",
          enum: ["file", "generate", "unknown"],
          description:
            "'file' = user is handing over ready content to send. 'generate' = user is asking the assistant to write/draft/compose content. 'unknown' otherwise.",
        },
        to: { type: "string", description: "Recipient email for kind='email'. Empty if not provided." },
        subject: { type: "string", description: "Email or reminder subject. Empty if not provided." },
        body: { type: "string", description: "Email or reminder body. Empty if not provided." },
        text: { type: "string", description: "LinkedIn post text. Empty if not provided." },
        missing: {
          type: "array",
          items: { type: "string" },
          description: "Names of required fields still missing for this kind (e.g. ['to','body']).",
        },
      },
      required: ["kind", "action"],
    },
  },
};

const SYSTEM = `You classify the user's latest chat message for outbound dispatch.

CRITICAL: Only return an outbound kind (email/linkedin/reminder) when the user is DISPATCHING ready content. If the user is asking the assistant to write, draft, compose, generate, create, or come up with content, return kind='none'. Do NOT intercept authoring requests.

Verbs that indicate action='file' (dispatch existing content):
  send, post, publish, schedule, share this, file this, submit, deliver.
Verbs that indicate action='generate' (authoring request — return kind='none'):
  write, draft, create, compose, generate, make, give me, help me with, come up with, brainstorm.
Quantity cues ("a post", "one post", "three posts", "a few", "5 options") always mean action='generate' — return kind='none'.

Only when kind ≠ 'none':
- email required: to, body.
- reminder required: body.
- linkedin required: text.
List any absent required field in "missing". Extract literal values from the user message — do not invent recipients, do not fabricate content.`;

export async function parseOutboundIntent(
  userText: string,
  recentHistory: { role: "user" | "assistant"; content: string }[] = [],
): Promise<OutboundIntent> {
  // Guardrails: skip very short messages and already-dispatched @mentions.
  const t = userText.trim();
  if (t.length < 8) return { kind: "none" };
  if (t.startsWith("@")) return { kind: "none" };

  const trimmedHistory = recentHistory.slice(-6);
  const userPrompt =
    (trimmedHistory.length
      ? "Recent chat (oldest first):\n" +
        trimmedHistory.map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 600)}`).join("\n") +
        "\n\n"
      : "") +
    `Latest user message:\n"""${userText.slice(0, 2000)}"""`;

  try {
    const { result } = await callTool<{
      kind: "none" | "email" | "reminder" | "linkedin";
      action?: OutboundAction;
      to?: string;
      subject?: string;
      body?: string;
      text?: string;
      missing?: string[];
    }>({
      system: SYSTEM,
      user: userPrompt,
      tool: TOOL,
      toolChoice: { name: "classify_outbound" },
      model: "x-ai/grok-4.3",
    });

    if (result.kind === "none") return { kind: "none" };

    const action: OutboundAction = result.action ?? "unknown";

    // Never let the outbound stub swallow an authoring request.
    if (action === "generate") return { kind: "none" };

    const missing: string[] = [];
    if (result.kind === "email") {
      if (!result.to) missing.push("to");
      if (!result.body) missing.push("body");
      return {
        kind: "email",
        action,
        to: result.to || undefined,
        subject: result.subject || undefined,
        body: result.body || undefined,
        missing: missing.length ? missing : undefined,
      };
    }
    if (result.kind === "reminder") {
      if (!result.body) missing.push("body");
      return {
        kind: "reminder",
        action,
        subject: result.subject || undefined,
        body: result.body || undefined,
        missing: missing.length ? missing : undefined,
      };
    }
    // linkedin
    if (!result.text) missing.push("text");
    return {
      kind: "linkedin",
      action,
      text: result.text || undefined,
      missing: missing.length ? missing : undefined,
    };
  } catch {
    return { kind: "none" };
  }
}

// Parse an explicit post count from the user's message. Defaults to 1.
export function parsePostCount(userText: string): number {
  const t = userText.toLowerCase();
  // digit form: "3 posts", "write 5 linkedin"
  const digit = t.match(/\b(\d{1,2})\s*(?:linkedin\s+)?(?:post|posts|variants|versions|options|drafts|ideas)\b/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= 20) return n;
  }
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const wordMatch = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:linkedin\s+)?(?:post|posts|variants|versions|options|drafts|ideas)\b/);
  if (wordMatch) return words[wordMatch[1]];
  if (/\ba\s+couple\s+(?:of\s+)?(?:linkedin\s+)?(?:post|posts)\b/.test(t)) return 2;
  if (/\ba\s+few\s+(?:linkedin\s+)?(?:post|posts)\b/.test(t)) return 3;
  return 1;
}

// Truncate a LinkedIn assistant reply to the first N posts if it produced more.
export function truncateToPostCount(markdown: string, n: number): string {
  if (n < 1) return markdown;
  // Split on common post delimiters produced by the model.
  const parts = markdown.split(/\n(?:---+|\*\*\*+)\n|\n(?=#{1,4}\s*Post\s*\d+)|\n(?=\*\*Post\s*\d+)/i);
  if (parts.length <= n) return markdown;
  return parts.slice(0, n).join("\n\n---\n\n").trim();
}

