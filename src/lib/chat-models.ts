// Client-safe model option list shown in the chat picker.
// Server resolves the OpenRouter slug via resolveChatModel in src/server/llm.server.ts.
export const CHAT_MODEL_OPTIONS = [
  { id: "hermes", label: "Hermes 4 405B" },
  { id: "grok", label: "Grok 4.3" },
  { id: "gpt", label: "ChatGPT 5.3" },
  { id: "claude", label: "Claude Opus 4.7" },
  { id: "deepseek", label: "DeepSeek V4 Pro" },
] as const;

export type ChatModelId = (typeof CHAT_MODEL_OPTIONS)[number]["id"];
