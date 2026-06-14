import { v4 as uuidv4 } from "uuid";
import type { WorkflowNode } from "@/lib/workflows.functions";

export type Template = {
  slug: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
};

export const WORKFLOW_TEMPLATES: Template[] = [
  {
    slug: "daily-executive-briefing",
    name: "Daily Executive Briefing",
    description: "Generates and sends a morning summary after human approval.",
    nodes: [
      { id: uuidv4(), type: "trigger", label: "Daily 7am", config: { cron: "0 7 * * *" } },
      { id: uuidv4(), type: "llm_step", label: "Generate Executive Briefing", config: { prompt: "Summarize today's key market insights and VDNX priorities in 5 bullets.", model: "grok" } },
      { id: uuidv4(), type: "human_review", label: "Sovereignty Review", config: {} },
      { id: uuidv4(), type: "action", label: "Send Email Digest", config: { action: "email", template: "daily-briefing" } },
    ],
  },
  {
    slug: "model-diversification-audit",
    name: "Model Diversification Audit",
    description: "Checks model usage across the workspace weekly and suggests balance.",
    nodes: [
      { id: uuidv4(), type: "trigger", label: "Weekly Mon 9am", config: { cron: "0 9 * * 1" } },
      { id: uuidv4(), type: "llm_step", label: "Audit model usage", config: { prompt: "Analyze the distribution of model usage across recent chats and recommend rebalancing across Hermes 4 405B, Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, DeepSeek V4 Pro, DeepSeek V4 Flash, Nemotron 3 Nano Omni 30B.", model: "claude" } },
      { id: uuidv4(), type: "human_review", label: "Review audit", config: {} },
      { id: uuidv4(), type: "output", label: "Dashboard Update", config: { summary: "Model diversification audit recorded." } },
    ],
  },
];

export const NODE_TYPES = ["trigger", "llm_step", "human_review", "action", "output"] as const;

export const NODE_TYPE_LABEL: Record<(typeof NODE_TYPES)[number], string> = {
  trigger: "Trigger",
  llm_step: "LLM Step",
  human_review: "Human Review",
  action: "Action",
  output: "Output",
};

export const ALLOWED_CHAT_MODELS = [
  { id: "hermes", label: "Hermes 4 405B" },
  { id: "grok", label: "Grok 4.3" },
  { id: "gpt", label: "ChatGPT 5.3" },
  { id: "claude", label: "Claude Opus 4.7" },
  { id: "deepseek", label: "DeepSeek V4 Pro" },
  { id: "deepseek-flash", label: "DeepSeek V4 Flash" },
  { id: "nemotron", label: "Nemotron 3 Nano Omni 30B" },
] as const;
