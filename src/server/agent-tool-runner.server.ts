import { chatCompletion, stripFences, tryParse } from "@/lib/llm.server";
import {
  executeToolCall,
  toOpenRouterTools,
  toolsForAgent,
  type ToolCtx,
  type ToolDef,
} from "@/server/agent-tools.server";

const DEFAULT_MAX_TOKENS = 8000;
const AGENT_TOOL_DEFAULT_MODEL = "deepseek/deepseek-v4-pro";
const HERMES_SLUG = "nousresearch/hermes-4-405b";
const AGENT_TOOL_MAX_TURNS = 6;

export type ToolInvocation = {
  name: string;
  args: unknown;
  result?: unknown;
  error?: string;
};

export type AgentToolResult = {
  finalMessage: string;
  toolCalls: ToolInvocation[];
  model: string;
};

function isHermes(model: string) {
  return model === HERMES_SLUG;
}

export async function callAgentTool(opts: {
  agent_slug: string;
  system: string;
  user: string;
  tools_to_use?: string[];
  max_turns?: number;
  model?: string;
  context?: { task_id?: string | null; thread_id?: string | null; owner_user_id?: string | null };
}): Promise<AgentToolResult> {
  const model = opts.model ?? AGENT_TOOL_DEFAULT_MODEL;
  const maxTurns = opts.max_turns ?? AGENT_TOOL_MAX_TURNS;
  const tools = toolsForAgent(opts.agent_slug, opts.tools_to_use);
  const ctx: ToolCtx = {
    agent_slug: opts.agent_slug,
    task_id: opts.context?.task_id ?? null,
    thread_id: opts.context?.thread_id ?? null,
    owner_user_id: opts.context?.owner_user_id ?? null,
  };
  if (isHermes(model)) return callAgentToolHermes({ ...opts, model, maxTurns, tools, ctx });
  return callAgentToolNative({ ...opts, model, maxTurns, tools, ctx });
}

async function callAgentToolNative(args: {
  system: string;
  user: string;
  model: string;
  maxTurns: number;
  tools: ToolDef<any>[];
  ctx: ToolCtx;
}): Promise<AgentToolResult> {
  const orTools = toOpenRouterTools(args.tools);
  const messages: any[] = [
    { role: "system", content: args.system },
    { role: "user", content: args.user },
  ];
  const invocations: ToolInvocation[] = [];

  for (let turn = 0; turn < args.maxTurns; turn++) {
    const json = await chatCompletion({
      messages,
      tools: orTools.length ? orTools : undefined,
      tool_choice: orTools.length ? "auto" : undefined,
      model: args.model,
      max_tokens: DEFAULT_MAX_TOKENS,
    });
    const choice = json?.choices?.[0];
    const msg = choice?.message ?? {};
    const toolCalls = msg.tool_calls ?? [];

    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    });

    if (!toolCalls.length) {
      return { finalMessage: msg.content ?? "", toolCalls: invocations, model: args.model };
    }

    for (const tc of toolCalls) {
      const name: string = tc.function?.name;
      const raw = tc.function?.arguments ?? "{}";
      const parsed = tryParse(raw);
      const parsedArgs = parsed.ok ? parsed.value : { __parse_error: parsed.error?.message ?? "invalid json" };
      const exec = await executeToolCall(name, parsedArgs, args.ctx);
      const result = exec.ok ? exec.result : { error: exec.error };
      invocations.push({
        name,
        args: parsedArgs,
        result: exec.ok ? exec.result : undefined,
        error: exec.ok ? undefined : exec.error,
      });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }

  return { finalMessage: "[max turns reached]", toolCalls: invocations, model: args.model };
}

async function callAgentToolHermes(args: {
  system: string;
  user: string;
  model: string;
  maxTurns: number;
  tools: ToolDef<any>[];
  ctx: ToolCtx;
}): Promise<AgentToolResult> {
  const toolSpec = args.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n");
  const envelope =
    `You can call tools by replying with ONLY a JSON object, no prose:\n` +
    `  {"tool":"<name>","args":{...}}\n` +
    `When you are done, reply with:\n` +
    `  {"tool":"final","args":{"reply_markdown":"..."}}\n\n` +
    `Available tools:\n${toolSpec}`;
  const messages: any[] = [
    { role: "system", content: `${args.system}\n\n${envelope}` },
    { role: "user", content: args.user },
  ];
  const invocations: ToolInvocation[] = [];

  for (let turn = 0; turn < args.maxTurns; turn++) {
    const json = await chatCompletion({
      messages,
      model: args.model,
      max_tokens: DEFAULT_MAX_TOKENS,
    });
    const content = json?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParse(stripFences(content));
    if (!parsed.ok) {
      return { finalMessage: content, toolCalls: invocations, model: args.model };
    }
    const env = parsed.value as { tool?: string; args?: unknown };
    if (env.tool === "final") {
      const reply = (env.args as any)?.reply_markdown ?? "";
      return { finalMessage: String(reply), toolCalls: invocations, model: args.model };
    }
    if (!env.tool) return { finalMessage: content, toolCalls: invocations, model: args.model };
    messages.push({ role: "assistant", content });
    const exec = await executeToolCall(env.tool, env.args ?? {}, args.ctx);
    const result = exec.ok ? exec.result : { error: exec.error };
    invocations.push({
      name: env.tool,
      args: env.args,
      result: exec.ok ? exec.result : undefined,
      error: exec.ok ? undefined : exec.error,
    });
    messages.push({ role: "user", content: `Tool ${env.tool} result:\n${JSON.stringify(result).slice(0, 8000)}` });
  }
  return { finalMessage: "[max turns reached]", toolCalls: invocations, model: args.model };
}