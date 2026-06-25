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
  {
    slug: "vdnx-wizard-sweep",
    name: "VDNX Wizard Sweep",
    description: "Signs into vdnx.app as the test account and HTTP-probes every wizard route. Pauses for human review of failures.",
    nodes: [
      { id: uuidv4(), type: "trigger", label: "Manual run", config: {} },
      {
        id: uuidv4(), type: "vdnx_route_probe", label: "Probe VDNX wizard routes",
        config: {
          email: "cmd-ai-test@vdnx.app",
          base_url: "https://vdnx.app",
          // routes: populated by the "Discover" action; each entry is { route, marker?, wizard? } or a plain route string
          routes: [],
        },
      },
      { id: uuidv4(), type: "human_review", label: "Review wizard sweep failures", config: {} },
      { id: uuidv4(), type: "output", label: "Wizard sweep recorded", config: { summary: "VDNX wizard sweep completed and reviewed." } },
    ],
  },
  {
    slug: "vdnx-calendar-daily",
    name: "Daily VDNX Calendar Sync",
    description: "Asks an LLM what should land on tomorrow's VDNX calendar, then drives the built-in calendar UI via Playwright.",
    nodes: [
      { id: uuidv4(), type: "trigger", label: "Daily 6pm", config: { cron: "0 18 * * *" } },
      { id: uuidv4(), type: "llm_step", label: "Draft tomorrow's events", config: { prompt: "List 1-3 events for tomorrow as JSON [{title,start_iso,end_iso,notes}]. Return only JSON.", model: "deepseek" } },
      { id: uuidv4(), type: "human_review", label: "Approve calendar entries", config: {} },
      { id: uuidv4(), type: "playwright_step", label: "Create in VDNX calendar", config: { script: "vdnx.calendar.create_event", inputs: { events: "{{steps.PREV.output}}" } } },
      { id: uuidv4(), type: "output", label: "Logged", config: { summary: "VDNX calendar updated for tomorrow." } },
    ],
  },
];

export const NODE_TYPES = ["trigger", "llm_step", "tool_call", "playwright_step", "human_review", "action", "output", "vdnx_route_probe"] as const;

export const NODE_TYPE_LABEL: Record<(typeof NODE_TYPES)[number], string> = {
  trigger: "Trigger",
  llm_step: "LLM Step",
  tool_call: "Tool Call",
  playwright_step: "Playwright (Browser)",
  human_review: "Human Review",
  action: "Action",
  output: "Output",
  vdnx_route_probe: "VDNX Route Probe",
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
