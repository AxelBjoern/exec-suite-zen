// Client-safe default model options shown before the user's model library loads.
// User-created models come from the backend's base_models table and use their
// OpenRouter slug as the selectable id.
export type ChatModelOption = {
  id: string;
  label: string;
  slug: string;
  provider?: string;
  description?: string;
  source?: "default" | "library";
};

export const CHAT_MODEL_OPTIONS = [
  { id: "hermes", label: "Hermes 4 405B", slug: "nousresearch/hermes-4-405b", source: "default" },
  { id: "grok", label: "Grok 4.3", slug: "x-ai/grok-4.3", source: "default" },
  { id: "gpt", label: "ChatGPT 5.3", slug: "openai/gpt-5.3-chat", source: "default" },
  { id: "claude", label: "Claude Opus 4.7", slug: "anthropic/claude-opus-4.7", source: "default" },
  { id: "deepseek", label: "DeepSeek V4 Pro", slug: "deepseek/deepseek-v4-pro", source: "default" },
  { id: "deepseek-flash", label: "DeepSeek V4 Flash", slug: "deepseek/deepseek-v4-flash", source: "default" },
  { id: "nemotron", label: "Nemotron 3 Nano Omni 30B", slug: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", source: "default" },
  { id: "kling", label: "Kling v3.0 Std (video)", slug: "kwaivgi/kling-v3.0-std", source: "default" },
] as const satisfies readonly ChatModelOption[];

export type ChatModelId = (typeof CHAT_MODEL_OPTIONS)[number]["id"];

// Models that produce video instead of text. Routed through OpenRouter's
// video generation path, not chat completions.
export const VIDEO_MODEL_IDS: ReadonlySet<ChatModelId> = new Set(["kling"]);
