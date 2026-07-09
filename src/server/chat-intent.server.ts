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

Return an outbound kind (email/linkedin/reminder) ONLY when the user is DISPATCHING content (either ready content, or content the previous assistant message just produced). If the user is asking the assistant to author fresh content from scratch, return kind='none'.

Verbs that indicate action='file' (dispatch — ready or previously-drafted content):
  send, post, publish, schedule, share, file, ship, submit, deliver, "post these", "file all", "ship them", "send the above".
Verbs that indicate action='generate' (authoring — return kind='none'):
  write, draft, compose, generate, create, make, "give me", "come up with", brainstorm.

When kind ≠ 'none':
- email required: to, body.
- reminder required: body.
- linkedin required: text. If the user is filing posts the assistant just drafted, leave text empty and list "text" in missing — the caller pulls it from history.
List absent required fields in "missing". Extract literal values from the user message — do not invent recipients or fabricate content.`;

// Cheap pre-check: skip the classifier LLM call when there is no dispatch verb.
const DISPATCH_VERB_RE = /\b(send|sends|sent|post|posts|posting|publish|publishes|published|schedul(?:e|es|ed|ing)|shar(?:e|es|ed|ing)|fil(?:e|es|ed|ing)|ship(?:s|ped|ping)?|submit(?:s|ted|ting)?|deliver(?:s|ed|ing)?)\b/i;

export async function parseOutboundIntent(
  userText: string,
  recentHistory: { role: "user" | "assistant"; content: string }[] = [],
): Promise<OutboundIntent> {
  // Guardrails: skip very short messages and already-dispatched @mentions.
  const t = userText.trim();
  if (t.length < 8) return { kind: "none" };
  if (t.startsWith("@")) return { kind: "none" };
  if (!DISPATCH_VERB_RE.test(t)) return { kind: "none" };

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
    // linkedin filing is user-initiated via the "Add to Outbound" button.
    if (result.kind === "linkedin") return { kind: "none" };
    return { kind: "none" };
  } catch {
    return { kind: "none" };
  }
}

// Parse an explicit post count from the user's message. Defaults to 1.
export function parsePostCount(userText: string): number {
  const t = userText.toLowerCase();
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  // digit form: "3 posts", "write 5 linkedin", or bare "write 3"
  const digit = t.match(/\b(\d{1,2})\s*(?:more\s+)?(?:linkedin\s+)?(?:post|posts|variants|versions|options|drafts|ideas)?\b/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= 20 && /\b(write|draft|create|compose|generate|make|give|need|want|another|more|post|posts|linkedin)\b/.test(t)) return n;
  }
  const wordMatch = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:more\s+)?(?:linkedin\s+)?(?:post|posts|variants|versions|options|drafts|ideas)?\b/);
  if (wordMatch) {
    // Only accept bare word count when authoring/post context present.
    if (/\b(post|posts|linkedin|variants|versions|options|drafts|ideas)\b/.test(t) || /\b(write|draft|create|compose|generate|make|give)\b/.test(t)) {
      return words[wordMatch[1]];
    }
  }
  if (/\ba\s+couple\s+(?:of\s+)?(?:linkedin\s+)?(?:post|posts)?\b/.test(t)) return 2;
  if (/\ba\s+few\s+(?:linkedin\s+)?(?:post|posts)?\b/.test(t)) return 3;
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

// Split an assistant draft into individual posts using the same delimiters
// as truncateToPostCount. Returns [markdown] if no delimiters are found.
export function splitPosts(markdown: string): string[] {
  const parts = markdown
    .split(/\n(?:---+|\*\*\*+)\n|\n(?=#{1,4}\s*Post\s*\d+)|\n(?=\*\*Post\s*\d+)/i)
    .map((p) => p.replace(/^#{1,4}\s*Post\s*\d+\s*[:\-]?\s*/i, "").replace(/^\*\*Post\s*\d+\*\*\s*[:\-]?\s*/i, "").trim())
    .filter((p) => p.length >= 20);
  return parts.length ? parts : [markdown.trim()];
}

