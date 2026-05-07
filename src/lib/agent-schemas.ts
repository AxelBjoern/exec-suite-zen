// JSON schemas used for structured tool-calling against the Lovable AI Gateway.
// Two tools: emit_artifact (solo + boardroom primary) and emit_consult (boardroom consult).

export const VALID_OWNERS = [
  "ceo", "cfo", "coo", "cto", "cmo", "cco", "sales", "linkedin", "social", "seo",
] as const;

export const ARTIFACT_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_artifact",
    description: "Produce a structured executive deliverable. Call exactly once.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "One strong line summarizing the deliverable.",
        },
        sections: {
          type: "array",
          minItems: 2,
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body_md: {
                type: "string",
                description: "Markdown body. Use tables when appropriate.",
              },
            },
            required: ["heading", "body_md"],
            additionalProperties: false,
          },
        },
        action_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task: { type: "string", description: "Imperative, concrete." },
              owner_agent: {
                type: "string",
                enum: VALID_OWNERS,
                description: "Slug of the agent who should pick this up.",
              },
              deliverable: {
                type: "string",
                description: "What 'done' looks like.",
              },
              due: {
                type: "string",
                description: "Relative or absolute (e.g. 'within 48h', '2026-Q1').",
              },
              auto_dispatch: {
                type: "boolean",
                description: "True for internal drafting/analysis. False for anything external (post, send, publish, commit, email, announce).",
              },
            },
            required: ["task", "owner_agent", "deliverable", "due", "auto_dispatch"],
            additionalProperties: false,
          },
        },
        requires_external_approval: {
          type: "boolean",
          description: "True if this artifact itself (not the action items) publishes externally.",
        },
        suggested_next_commands: {
          type: "array",
          maxItems: 4,
          items: { type: "string", description: "e.g. ':social calendar Q1 launch'" },
        },
      },
      required: [
        "title",
        "sections",
        "action_items",
        "requires_external_approval",
        "suggested_next_commands",
      ],
      additionalProperties: false,
    },
  },
};

export const CONSULT_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_consult",
    description: "Respond to a boardroom proposal from your seat. Call exactly once.",
    parameters: {
      type: "object",
      properties: {
        position: { type: "string", enum: ["agree", "disagree", "amend"] },
        rationale: { type: "string", description: "2–4 sentences from your domain." },
        amendments: {
          type: "array",
          items: { type: "string" },
          description: "Concrete changes you propose. Empty if you fully agree.",
        },
        blocking: {
          type: "boolean",
          description: "True if you would veto without these changes.",
        },
      },
      required: ["position", "rationale", "amendments", "blocking"],
      additionalProperties: false,
    },
  },
};

export type Artifact = {
  title: string;
  sections: { heading: string; body_md: string }[];
  action_items: {
    task: string;
    owner_agent: string;
    deliverable: string;
    due: string;
    auto_dispatch: boolean;
  }[];
  requires_external_approval: boolean;
  suggested_next_commands: string[];
};

export const CHAT_TOOL = {
  type: "function" as const,
  function: {
    name: "chat_reply",
    description: "Answer a quick question conversationally. Use this when the operator's prompt does not warrant a full structured deliverable (no plan, model, memo, or RFC needed).",
    parameters: {
      type: "object",
      properties: {
        reply_markdown: {
          type: "string",
          description: "Your answer in markdown. Concise, decision-grade, no filler. May include bullets, short tables, code.",
        },
        suggested_next_commands: {
          type: "array",
          maxItems: 4,
          items: { type: "string" },
          description: "Optional follow-up commands the operator might run.",
        },
      },
      required: ["reply_markdown", "suggested_next_commands"],
      additionalProperties: false,
    },
  },
};

export const ROUTE_TOOL = {
  type: "function" as const,
  function: {
    name: "route_prompt",
    description: "Pick the right VDNX agent(s) to answer a free-form prompt.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["solo", "boardroom"] },
        primary_agent: { type: "string", enum: VALID_OWNERS },
        consult_agents: {
          type: "array",
          items: { type: "string", enum: VALID_OWNERS },
          description: "Empty for solo. 1–3 peers for boardroom.",
        },
        inferred_verb: {
          type: "string",
          description: "Best-fit verb from the agent's verb list, or 'respond' if none fits.",
        },
        reasoning: { type: "string", description: "One sentence why." },
      },
      required: ["mode", "primary_agent", "consult_agents", "inferred_verb", "reasoning"],
      additionalProperties: false,
    },
  },
};

export type ChatReply = {
  reply_markdown: string;
  suggested_next_commands: string[];
};

export type RouteDecision = {
  mode: "solo" | "boardroom";
  primary_agent: string;
  consult_agents: string[];
  inferred_verb: string;
  reasoning: string;
};

export type Consult = {
  position: "agree" | "disagree" | "amend";
  rationale: string;
  amendments: string[];
  blocking: boolean;
};

// External keywords — if a verb or args contains these, force approval gate
// regardless of what the model marked.
export const EXTERNAL_KEYWORDS = [
  "post", "publish", "send", "announce", "email", "tweet", "commit",
  "merge", "deploy", "press", "launch-day",
];

// Internal verbs that are always safe to auto-dispatch.
export const INTERNAL_VERBS = new Set([
  "draft", "outline", "analyze", "model", "audit", "review", "brief",
  "research", "summarize", "score", "map", "plan", "propose", "rfc",
  "architect", "forecast", "variance", "kyc-review", "risk-memo",
  "keyword-map", "profile-audit", "discovery", "trend-brief",
  "respond", "chat", "answer",
]);

export function shouldGate(verb: string, args: string): boolean {
  const blob = `${verb} ${args}`.toLowerCase();
  return EXTERNAL_KEYWORDS.some(k => blob.includes(k));
}
