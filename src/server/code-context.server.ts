// Code-context preflight: lets an agent fetch relevant VDNX source files
// before producing its final artifact. Uses OpenRouter tool-calling in a
// short multi-turn loop.

import { chatCompletion, type ChatMessage } from "@/lib/llm.server";
import { listRepoDir, readRepoFile, searchRepoCode } from "@/lib/github.server";

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_vdnx_dir",
      description: "List files/folders in the VDNX repo at a given path. Use '' for root.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Repo-relative path. '' = root." } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_vdnx_file",
      description: "Read a file from the VDNX repo. Content is truncated at ~8k chars.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Repo-relative file path." } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_vdnx_code",
      description: "GitHub code search across the VDNX repo. Returns up to 10 matches with snippets.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Code search query (supports GitHub search syntax)." } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "finish",
      description: "Call when you have gathered enough VDNX context (or decided none is needed).",
      parameters: {
        type: "object",
        properties: { summary: { type: "string", description: "Brief note on what was gathered, or 'none needed'." } },
        required: ["summary"],
        additionalProperties: false,
      },
    },
  },
];

const SYSTEM = `You are a code-context fetcher for a VDNX agent.
Your job: decide whether the operator's prompt needs information from the live VDNX repository, and if so, fetch the most relevant files.

Rules:
- If the prompt references a file, feature, bug, route, component, or specific code behavior in VDNX → use the tools to fetch it.
- If the prompt is purely strategic/financial/marketing with no code reference → call "finish" with summary "none needed".
- Be surgical: at most 5 tool calls total. Prefer search_vdnx_code or list_vdnx_dir to locate files, then read_vdnx_file for the 1–3 most relevant.
- Always end by calling "finish".`;

type GatheredFile = { path: string; content: string };

export async function gatherVdnxContext(opts: {
  prompt: string;
  model: string;
}): Promise<{ contextBlock: string; files: GatheredFile[]; summary: string }> {
  // Check env up front so we fail fast with a useful message.
  if (!process.env.GITHUB_TOKEN || !process.env.VDNX_REPO) {
    return { contextBlock: "", files: [], summary: "github bridge not configured" };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Operator prompt:\n${opts.prompt}\n\nDecide if VDNX code context is needed. Use tools, then call finish.` },
  ];

  const files: GatheredFile[] = [];
  const trace: string[] = [];
  let summary = "none needed";

  for (let step = 0; step < 6; step++) {
    const json = await chatCompletion({
      messages: messages as any,
      tools: TOOLS,
      tool_choice: "auto",
      model: opts.model,
    });

    const msg = json?.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (!calls.length) break;

    messages.push({ role: "assistant", content: msg.content ?? "", ...({ tool_calls: calls } as any) } as any);

    let finished = false;
    for (const call of calls) {
      const name = call?.function?.name;
      let args: any = {};
      try { args = JSON.parse(call?.function?.arguments ?? "{}"); } catch { /* noop */ }

      let result: any;
      try {
        if (name === "list_vdnx_dir") {
          result = await listRepoDir(args.path ?? "");
          trace.push(`list ${args.path || "/"}`);
        } else if (name === "read_vdnx_file") {
          const f = await readRepoFile(args.path);
          result = f;
          files.push({ path: f.path, content: f.content });
          trace.push(`read ${f.path}`);
        } else if (name === "search_vdnx_code") {
          result = await searchRepoCode(args.query ?? "");
          trace.push(`search "${args.query}"`);
        } else if (name === "finish") {
          summary = String(args.summary ?? "").slice(0, 240) || "done";
          finished = true;
          result = { ok: true };
        } else {
          result = { error: `unknown tool ${name}` };
        }
      } catch (e: any) {
        result = { error: e?.message ?? String(e) };
      }

      messages.push({
        role: "tool" as any,
        content: JSON.stringify(result).slice(0, 9000),
        ...({ tool_call_id: call.id, name } as any),
      } as any);
    }

    if (finished) break;
  }

  if (!files.length) {
    return { contextBlock: "", files: [], summary };
  }

  const block = [
    "=== VDNX REPO CONTEXT (live from GitHub) ===",
    `Summary: ${summary}`,
    `Fetched: ${trace.join(" • ")}`,
    "",
    ...files.map(f => `--- ${f.path} ---\n${f.content}`),
    "=== END VDNX REPO CONTEXT ===",
  ].join("\n");

  return { contextBlock: block, files, summary };
}

// ── VDNX repo intent detection + overview auto-inject ───────────────────────

const VDNX_INTENT_RE =
  /\bvdnx\s*(repo|repository|source|code|codebase|project)\b|\bvdnx\s+(?:src|app|edge|supabase)\b|\b(?:analyz|review|audit|inspect|read|check|look at|examine|explore|explain)\b[^.]{0,60}\bvdnx\b|\bin\s+(?:the\s+)?vdnx\b/i;

export function detectsVdnxRepoIntent(prompt: string): boolean {
  if (!prompt) return false;
  return VDNX_INTENT_RE.test(prompt);
}

let overviewCache: { at: number; block: string } | null = null;
const OVERVIEW_TTL_MS = 5 * 60_000;

export async function getVdnxRepoOverview(): Promise<string> {
  if (!process.env.GITHUB_TOKEN || !process.env.VDNX_REPO) return "";
  const now = Date.now();
  if (overviewCache && now - overviewCache.at < OVERVIEW_TTL_MS) return overviewCache.block;

  const parts: string[] = [];
  const grab = async (fn: () => Promise<string>) => {
    try { return await fn(); } catch (e: any) { return `(unavailable: ${e?.message ?? "error"})`; }
  };

  const [rootList, srcList, pkg, readme] = await Promise.all([
    grab(async () => {
      const d = await listRepoDir("");
      return d.entries.map(e => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n");
    }),
    grab(async () => {
      const d = await listRepoDir("src");
      return d.entries.map(e => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n");
    }),
    grab(async () => {
      const f = await readRepoFile("package.json");
      return f.content.slice(0, 2000);
    }),
    grab(async () => {
      const f = await readRepoFile("README.md");
      return f.content.slice(0, 2000);
    }),
  ]);

  parts.push(
    "=== VDNX REPO OVERVIEW (live) ===",
    `Repo: ${process.env.VDNX_REPO}`,
    "",
    "--- root/ ---",
    rootList,
    "",
    "--- src/ ---",
    srcList,
    "",
    "--- package.json (excerpt) ---",
    pkg,
    "",
    "--- README.md (excerpt) ---",
    readme,
    "=== END VDNX REPO OVERVIEW ===",
    "",
    "You have live read-only access to this repo via tools: list_vdnx_dir(path), read_vdnx_file(path), search_vdnx_code(query). USE them to ground every claim in actual file contents. NEVER ask the operator to paste repo context — fetch it yourself.",
  );

  const block = parts.join("\n");
  overviewCache = { at: now, block };
  return block;
}

