// Outbound intent classifier — server-only helper used by chat.
// Uses OpenRouter via src/server/llm.server.ts (project memory rule).
import { callTool, type ChatMessage } from "@/server/llm.server";

export type OutboundIntent =
  | { kind: "none" }
  | { kind: "email"; to?: string; subject?: string; body?: string; missing?: string[] }
  | { kind: "reminder"; subject?: string; body?: string; missing?: string[] }
  | { kind: "linkedin"; text?: string; missing?: string[] };

const TOOL = {
  type: "function" as const,
  function: {
    name: "classify_outbound",
    description:
      "Detect if the user wants to send an email, post on LinkedIn, or set a reminder. If so, extract fields. If unrelated to outbound communication, return kind 'none'.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["none", "email", "reminder", "linkedin"] },
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
      required: ["kind"],
    },
  },
};

const SYSTEM = `You classify the user's latest chat message.
Return kind='email' if they want to send an email; kind='linkedin' for a LinkedIn post; kind='reminder' to remind themself or the owner; kind='none' otherwise.

Heuristics:
- "send me a mail", "email me", "remind me" → reminder (no recipient needed, addressed to owner).
- "send mail to alex@x.com about ...", "email alex@..." → email.
- "post on linkedin", "share on linkedin", "@board post ..." → linkedin.
- Generic questions, plans, chit-chat → none.

Required fields:
- email: to, body (subject is nice-to-have; infer from body if blank).
- reminder: body (subject is nice-to-have).
- linkedin: text.

When a required field is absent from the message, list it in "missing".
Extract literal values from the user message — do not invent recipients, do not fabricate content.`;

export async function parseOutboundIntent(
  userText: string,
  recentHistory: { role: "user" | "assistant"; content: string }[] = [],
): Promise<OutboundIntent> {
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

    const missing: string[] = [];
    if (result.kind === "email") {
      if (!result.to) missing.push("to");
      if (!result.body) missing.push("body");
      return {
        kind: "email",
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
        subject: result.subject || undefined,
        body: result.body || undefined,
        missing: missing.length ? missing : undefined,
      };
    }
    // linkedin
    if (!result.text) missing.push("text");
    return {
      kind: "linkedin",
      text: result.text || undefined,
      missing: missing.length ? missing : undefined,
    };
  } catch {
    return { kind: "none" };
  }
}

// Tiny helper unused-export silencer for `ChatMessage` re-import requirement
export type _unused = ChatMessage;
