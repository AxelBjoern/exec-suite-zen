import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  chatCompletion,
  resolveChatModel,
  resolveTextChatModel,
  type ChatMessage,
} from "@/server/llm.server";
import { DEFAULT_COMPANY_CONTEXT, getCompanyContextForEmail } from "@/lib/agent-prompts";
import { dispatch, routePrompt } from "@/serverfns/terminal.functions";
import {
  renderDocx,
  renderPdf,
  type DocOutline,
} from "@/server/doc-generator.server";
import { generateCeoVideo } from "@/serverfns/video.functions";
import { webSearch, webFetch, extractUrls } from "@/server/web.server";
import { listRepoDir, readRepoFile, searchRepoCode, parseRepoTarget } from "@/server/github.server";
import { isVdnxOwner } from "@/server/designRules.server";
import { assertModelAllowedForUser } from "@/lib/models.functions";

const VALID_DISPATCH_SLUGS = [
  "ceo", "cfo", "coo", "cto", "cmo", "cco", "sales", "linkedin", "social", "seo",
] as const;

function buildCeoSystem(email: string | null | undefined): string {
  const ctx = getCompanyContextForEmail(email);
  const owner = isVdnxOwner(email);
  const dispatchLine = owner
    ? `- You CAN dispatch specialist agents directly from this chat. Tell the operator they can prefix a message with @cfo, @coo, @cto, @cmo, @cco, @sales, @linkedin, @social, @seo to dispatch that specialist, or @board to convene a cross-functional boardroom. The dispatched artifact will appear inline.`
    : `- Specialist-agent dispatch (@cfo, @board, etc.) is restricted to the workspace owner and unavailable on this account.`;
  return `${ctx}

You are the ${owner ? "VDNX " : ""}CEO Agent in conversational chat mode with the operator.

Rules:
- Talk like a sharp, decisive chief executive. Direct, founder-grade, no filler, active voice.
- Markdown is welcome (headings, bullets, tables) but keep replies tight unless asked for depth.
- Never invent metrics or commitments. If you don't know, say so and propose how to find out.
- This is conversational — do NOT emit JSON or "Artifact" sections unless the operator explicitly asks for a deliverable. (You MAY silently call the web tools below; their results are turned into your final markdown answer.)
- **NEVER fabricate file links, download URLs, or storage paths.** Documents are produced ONLY by the /pdf and /docx slash commands; you have no ability to upload files. If the operator wants a file, instruct them to type \`/pdf <topic>\` or \`/docx <topic>\` — do not write a Markdown download link yourself.
${dispatchLine}
- The operator can also generate downloadable documents: \`/pdf <topic>\` produces a PDF and \`/docx <topic>\` produces a Word document. They can also generate a 5-second video clip with \`/video <prompt>\` (Kling v3.0 Std), optionally with narration via \`/video <visual> | <narration text>\` (ElevenLabs, voice: Sarah). Mention these when relevant.
- You have **live internet access via two tools** (Firecrawl-backed): \`web_search(query, limit?)\` for live web search and \`web_fetch(url)\` to read a specific page. Call them yourself whenever you need fresh facts, benchmarks, prices, or to verify a claim — do NOT tell the operator you lack web access, and do NOT ask them to run \`/search\` manually. The slash commands \`/search <q>\` and \`/fetch <url>\` are also available as shortcuts they can type. Cite sources inline as \`[domain](url)\`.
- You can read GitHub repos (read-only): \`/repo <owner/repo>\` for an overview, \`/repo ls <owner/repo>[/path]\`, \`/repo cat <owner/repo>/<file>\`, \`/repo search <owner/repo> <query>\`. Full GitHub URLs are also accepted.
- When the operator attaches documents, read the content provided under "Attached documents" and ground your reply in it.`;
}

// Legacy export retained for callers (doc builder etc.) that don't have per-user email handy.
const CEO_SYSTEM = buildCeoSystem(null);

// ── Web tools (Firecrawl) exposed as native tool-calls to the model ─────────

const WEB_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Live web search via Firecrawl. Use whenever you need fresh facts, benchmarks, prices, or to verify a claim.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          limit: { type: "integer", minimum: 1, maximum: 8, description: "Max results (default 6)." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch and read a specific web page (markdown) via Firecrawl.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute URL of the page to fetch." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_vdnx_dir",
      description: "List files/folders in the VDNX repo at a given path. Use '' for root. Use this to ground any VDNX-code question.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Repo-relative path. '' = root." } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_vdnx_file",
      description: "Read a file from the VDNX repo. Content truncated at ~8k chars. Use this to ground claims about specific files.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Repo-relative file path." } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_vdnx_code",
      description: "GitHub code search across the VDNX repo. Returns up to 10 matches with snippets. Use to locate symbols/files.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Code search query." } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
] as const;

async function runWebTool(name: string, args: any): Promise<unknown> {
  try {
    if (name === "web_search") {
      const q = String(args?.query ?? "").trim();
      if (!q) return { error: "query is required" };
      const limit = Math.min(8, Math.max(1, Number(args?.limit) || 6));
      const results = await webSearch(q, limit);
      return {
        results: results.map((r) => ({
          url: r.url,
          title: r.title,
          description: r.description,
        })),
      };
    }
    if (name === "web_fetch") {
      const u = String(args?.url ?? "").trim();
      if (!u) return { error: "url is required" };
      const page = await webFetch(u);
      return {
        url: page.url,
        title: page.title,
        description: page.description,
        markdown: (page.markdown ?? "").slice(0, 6000),
      };
    }
    return { error: `unknown tool: ${name}` };
  } catch (e: any) {
    return { error: e?.message ?? "tool failed" };
  }
}

async function runChatWithWebTools(opts: {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  disableTools?: boolean;
}): Promise<string> {
  const msgs: any[] = [...opts.messages];
  const MAX_ITERS = 4;
  let toolsDisabled = !!opts.disableTools;
  for (let i = 0; i < MAX_ITERS; i++) {
    let json: any;
    try {
      json = await chatCompletion({
        messages: msgs,
        ...(toolsDisabled ? {} : { tools: WEB_TOOLS as any, tool_choice: "auto" as const }),
        temperature: opts.temperature,
        model: opts.model,
        ...(opts.max_tokens ? { max_tokens: opts.max_tokens } : {}),
      });
    } catch (e: any) {
      // Model has no tool-capable endpoint (e.g. Claude Opus 4.7 on OpenRouter).
      // Retry the same model without tools rather than swapping models.
      const emsg = e?.message ?? "";
      if (/No endpoints found that support image input/i.test(emsg)) {
        throw new Error(
          "The selected model can't read images. Pick Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, or DeepSeek V4 Pro to analyze attached images, or remove the image to continue with this model.",
        );
      }
      if (!toolsDisabled && (/no tool-capable endpoint/i.test(emsg) || /No endpoints found that can handle the requested parameters/i.test(emsg) || /\b404\b/.test(emsg))) {
        toolsDisabled = true;
        i--;
        continue;
      }
      throw e;
    }
    const msg = json?.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls;
    if (!toolCalls?.length) {
      return (msg?.content ?? "").trim() || "(no reply)";
    }
    msgs.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { args = {}; }
      const result = await runWebTool(tc.function?.name ?? "", args);
      msgs.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function?.name,
        content: JSON.stringify(result).slice(0, 12000),
      });
    }
  }
  // Final pass without tools to force a textual answer.
  const json = await chatCompletion({
    messages: msgs,
    temperature: opts.temperature,
    model: opts.model,
    ...(opts.max_tokens ? { max_tokens: opts.max_tokens } : {}),
  });
  return (json?.choices?.[0]?.message?.content ?? "").trim() || "(no reply)";
}

// ── Document generation (PDF / DOCX) ────────────────────────────────────────


const DOC_AUTHOR = "VDNX CEO Agent";

async function buildDocOutline(opts: {
  topic: string;
  kind: "pdf" | "docx";
  model?: string;
  history: ChatMessage[];
}): Promise<DocOutline> {
  const system = `${DEFAULT_COMPANY_CONTEXT}

You are the VDNX CEO Agent producing a publish-ready executive document.

Write the document the operator asked for. Be specific, decisive, founder-grade — no filler, no hedging. Use numbers and concrete recommendations. Never invent metrics; if a number is unknown, state the assumption.

Respond with ONLY a single valid JSON object — no prose, no markdown fences. Schema:

{
  "title": "string (≤90 chars)",
  "subtitle": "string (optional, ≤140 chars)",
  "sections": [
    { "heading": "string", "paragraphs": ["string", "string", ...] }
  ]
}

Rules:
- 4–8 sections, each with 2–6 substantial paragraphs.
- Plain text in paragraphs (no markdown, no bullet characters). Use complete sentences.
- First section is typically "Executive Summary".
- Last section is typically "Recommended Next Steps" or "Decision Required".`;

  const json = await chatCompletion({
    model: resolveChatModel(opts.model),
    temperature: 0.5,
    messages: [
      { role: "system", content: system },
      ...opts.history.slice(-12),
      {
        role: "user",
        content: `Produce a ${opts.kind === "pdf" ? "PDF" : "Word"} document on:\n\n${opts.topic}\n\nReturn JSON only.`,
      },
    ],
  });

  const raw: string = json?.choices?.[0]?.message?.content?.trim() ?? "";
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to salvage by extracting the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model did not return valid JSON for the document.");
    parsed = JSON.parse(match[0]);
  }

  if (!parsed?.title || !Array.isArray(parsed?.sections) || parsed.sections.length === 0) {
    throw new Error("Document outline missing title or sections.");
  }

  return {
    title: String(parsed.title).slice(0, 200),
    subtitle: parsed.subtitle ? String(parsed.subtitle).slice(0, 240) : undefined,
    author: DOC_AUTHOR,
    sections: parsed.sections
      .filter((s: any) => s && s.heading && Array.isArray(s.paragraphs))
      .map((s: any) => ({
        heading: String(s.heading),
        paragraphs: s.paragraphs.map((p: any) => String(p)).filter(Boolean),
      })),
  };
}

function safeFilename(title: string, ext: string) {
  const base = title
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "document";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${base}-${ts}.${ext}`;
}

function normalizeDocTopic(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^\/(pdf|docx)\b[\s:@-]*/i, "")
    .replace(/\[Download[^\]]+\]\([^)]*\)/gi, " ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function conversationTitleFromText(value: string | null | undefined) {
  return (
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "New conversation"
  );
}

function sanitizeAutoTitle(raw: string): string {
  const cleaned = String(raw ?? "")
    .replace(/^```[\s\S]*?\n|```$/g, "")
    .replace(/[`*_#>]/g, "")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").slice(0, 4).join(" ");
  return words.slice(0, 60);
}

/**
 * Generate a 2–4 word title for a conversation using a cheap allowed model.
 * Fire-and-forget; failures are swallowed so naming never breaks the chat.
 */
async function maybeAutoTitleConversation(opts: {
  conversationId: string;
  userText: string;
  assistantText: string;
}) {
  try {
    const { data: convo } = await supabaseAdmin
      .from("ceo_conversations")
      .select("title")
      .eq("id", opts.conversationId)
      .maybeSingle();
    if (!convo) return;

    const currentTitle = String(convo.title ?? "").trim();
    const derivedFromFirst = conversationTitleFromText(opts.userText);
    const isPlaceholder =
      currentTitle === "" ||
      currentTitle === "New conversation" ||
      currentTitle === derivedFromFirst;
    if (!isPlaceholder) return;

    // Only title once we have at least the first user + assistant pair.
    const { count } = await supabaseAdmin
      .from("ceo_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", opts.conversationId);
    if ((count ?? 0) < 2) return;

    const json = await chatCompletion({
      model: "deepseek/deepseek-v4-flash",
      temperature: 0.2,
      max_tokens: 30,
      messages: [
        {
          role: "system",
          content:
            "Return ONLY a 2–4 word title in Title Case summarizing the conversation. No quotes, no punctuation at the end, no prefix like 'Title:'. Just the words.",
        },
        {
          role: "user",
          content: `User: ${opts.userText.slice(0, 400)}\n\nAssistant: ${opts.assistantText.slice(0, 400)}\n\nTitle:`,
        },
      ],
    });
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const title = sanitizeAutoTitle(raw);
    if (!title) return;

    await supabaseAdmin
      .from("ceo_conversations")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", opts.conversationId);
  } catch {
    // swallow — auto-title is best-effort
  }
}

async function ensureCeoConversation(opts: {
  conversationId?: string | null;
  title?: string | null;
}) {
  const desiredId = opts.conversationId ?? null;
  const title = conversationTitleFromText(opts.title);

  // If the client supplied an id, only use it when it points to a real row.
  // We deliberately do NOT recreate a missing conversation under the same id —
  // stale ids (from another browser/tab, after a delete, etc.) must not be
  // resurrected, since that lets messages leak across chats. Instead, fall
  // through and mint a fresh conversation.
  if (desiredId) {
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("ceo_conversations")
      .select("id")
      .eq("id", desiredId)
      .maybeSingle();

    const lookupMessage = lookupErr?.message ?? "";
    if (lookupErr && !/invalid input syntax for type uuid/i.test(lookupMessage)) {
      throw lookupErr;
    }
    if (existing?.id) return existing.id;
  }

  const { data: convo, error } = await supabaseAdmin
    .from("ceo_conversations")
    .insert({ title })
    .select("id")
    .single();
  if (error) throw error;
  return convo.id;
}

async function insertCeoChatMessage<TSelect extends string>(opts: {
  role: "user" | "assistant";
  content: string;
  conversationId?: string | null;
  title?: string | null;
  artifactJson?: Record<string, any> | null;
  modelUsed?: string | null;
  select: TSelect;
}) {
  let conversationId = await ensureCeoConversation({
    conversationId: opts.conversationId,
    title: opts.title ?? opts.content,
  });

  const insertOnce = async () =>
    supabaseAdmin
      .from("ceo_chat_messages")
      .insert({
        role: opts.role,
        content: opts.content,
        conversation_id: conversationId,
        ...(opts.artifactJson === undefined ? {} : { artifact_json: opts.artifactJson }),
        ...(opts.modelUsed === undefined ? {} : { model_used: opts.modelUsed }),
      })
      .select(opts.select)
      .single();

  let { data, error } = await insertOnce();
  if (error && /ceo_chat_messages_conversation_id_fkey/i.test(error.message ?? "")) {
    conversationId = await ensureCeoConversation({
      conversationId,
      title: opts.title ?? opts.content,
    });
    const retry = await insertOnce();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;

  // Auto-title the conversation after the first assistant reply lands.
  if (opts.role === "assistant" && conversationId) {
    await maybeAutoTitleConversation({
      conversationId,
      userText: opts.title ?? "",
      assistantText: opts.content,
    });
  }

  return { data, conversationId };
}

async function resolveDocumentTopic(opts: {
  kind: "pdf" | "docx";
  explicitTopic?: string | null;
  conversationId?: string | null;
}) {
  const explicit = normalizeDocTopic(opts.explicitTopic);
  if (explicit) return explicit;

  if (opts.conversationId) {
    const { data: recent } = await supabaseAdmin
      .from("ceo_chat_messages")
      .select("content, artifact_json")
      .eq("conversation_id", opts.conversationId)
      .order("created_at", { ascending: false })
      .limit(12);

    for (const row of recent ?? []) {
      const artifactTitle = normalizeDocTopic((row.artifact_json as any)?.title);
      if (artifactTitle) return artifactTitle;

      const contentTopic = normalizeDocTopic(row.content);
      if (contentTopic) return contentTopic;
    }
  }

  return opts.kind === "pdf"
    ? "Executive summary from current conversation"
    : "Executive brief from current conversation";
}

export const generateCeoDocument = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      kind: "pdf" | "docx";
      topic: string;
      conversationId?: string | null;
      model?: string;
    }) => {
      const kind = d?.kind === "docx" ? "docx" : "pdf";
      const topic = (d?.topic ?? "").trim();
      if (topic.length > 4000) throw new Error("Topic too long");
      return {
        kind: kind as "pdf" | "docx",
        topic,
        conversationId: d?.conversationId ?? null,
        model: d?.model,
      };
    },
  )
  .handler(async ({ data }) => {
    const topic = await resolveDocumentTopic({
      kind: data.kind,
      explicitTopic: data.topic,
      conversationId: data.conversationId,
    });

    // 1. Ensure a conversation
    let conversationId = await ensureCeoConversation({
      conversationId: data.conversationId,
      title: `${data.kind.toUpperCase()}: ${topic.slice(0, 60)}`,
    });

    // 2. Save the operator's "user" message describing the request
    const userMd = `/${data.kind} ${topic}`;
    const { conversationId: ensuredConversationId } = await insertCeoChatMessage({
      role: "user",
      content: userMd,
      conversationId,
      title: `${data.kind.toUpperCase()}: ${topic.slice(0, 60)}`,
      select: "id",
    });
    conversationId = ensuredConversationId;

    // 3. Load short history for context
    const { data: history } = await supabaseAdmin
      .from("ceo_chat_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40);

    try {
      // 4. Generate outline + render file
      const outline = await buildDocOutline({
        topic,
        kind: data.kind,
        model: data.model,
        history: (history ?? []).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const bytes =
        data.kind === "pdf" ? await renderPdf(outline) : await renderDocx(outline);
      const previewBytes = data.kind === "docx" ? await renderPdf(outline) : null;

      const filename = safeFilename(outline.title, data.kind);
      const storagePath = `${conversationId}/${crypto.randomUUID()}-${filename}`;
      const previewFilename =
        data.kind === "docx"
          ? filename.replace(/\.docx$/i, ".preview.pdf")
          : null;
      const previewStoragePath = previewFilename
        ? `${conversationId}/${crypto.randomUUID()}-${previewFilename}`
        : null;
      const contentType =
        data.kind === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      const { error: upErr } = await supabaseAdmin.storage
        .from("chat-documents")
        .upload(storagePath, bytes, { contentType, upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      if (previewBytes && previewStoragePath) {
        const { error: previewErr } = await supabaseAdmin.storage
          .from("chat-documents")
          .upload(previewStoragePath, previewBytes, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (previewErr) throw new Error(`Preview upload failed: ${previewErr.message}`);
      }

      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from("chat-documents").getPublicUrl(storagePath);
      const previewUrl = previewStoragePath
        ? supabaseAdmin.storage.from("chat-documents").getPublicUrl(previewStoragePath)
            .data.publicUrl
        : null;

      const sizeKB = Math.max(1, Math.round(bytes.length / 1024));
      const replyMd = [
        `📄 **${outline.title}** generated.`,
        outline.subtitle ? `_${outline.subtitle}_` : "",
        "",
        `[Download ${data.kind.toUpperCase()} — ${filename} (${sizeKB} KB)](${publicUrl})`,
        "",
        "**Outline**",
        ...outline.sections.map((s, i) => `${i + 1}. ${s.heading}`),
      ]
        .filter(Boolean)
        .join("\n");

      const artifactJson = {
        kind: data.kind,
        title: outline.title,
        subtitle: outline.subtitle ?? null,
        filename,
        url: publicUrl,
        previewKind: previewUrl ? "pdf" : null,
        previewUrl,
        sizeKB,
        createdAt: new Date().toISOString(),
      };

      const { data: saved, conversationId: finalConversationId } = await insertCeoChatMessage({
        role: "assistant",
        content: replyMd,
        conversationId,
        title: `${data.kind.toUpperCase()}: ${topic.slice(0, 60)}`,
        artifactJson,
        select: "id, role, content, created_at, artifact_json",
      });
      conversationId = finalConversationId;

      await supabaseAdmin
        .from("ceo_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      return { ...saved, conversation_id: conversationId, downloadUrl: publicUrl };
    } catch (e: any) {
      const errMd = `**Failed to generate ${data.kind.toUpperCase()}:** ${e?.message ?? "unknown error"}`;
      const { data: saved, conversationId: finalConversationId } = await insertCeoChatMessage({
        role: "assistant",
        content: errMd,
        conversationId,
        title: `${data.kind.toUpperCase()}: ${topic.slice(0, 60)}`,
        select: "id, role, content, created_at",
      });
      conversationId = finalConversationId;
      return { ...(saved ?? {}), conversation_id: conversationId };
    }
  });


const MAX_EXTRACTED_CHARS = 30_000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// ── Conversations ───────────────────────────────────────────────────────────

export const listCeoConversations = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("ceo_conversations")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  },
);

export const createCeoConversation = createServerFn({ method: "POST" })
  .inputValidator((d: { title?: string }) => ({
    title: (d?.title ?? "New conversation").trim().slice(0, 120) || "New conversation",
  }))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("ceo_conversations")
      .insert({ title: data.title })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw error;
    return row;
  });

export const renameCeoConversation = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; title: string }) => {
    if (!d?.id) throw new Error("Missing conversation id");
    const title = (d?.title ?? "").trim().slice(0, 120);
    if (!title) throw new Error("Title is required");
    return { id: d.id, title };
  })
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("ceo_conversations")
      .update({ title: data.title, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCeoConversation = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("Missing conversation id");
    return { id: d.id };
  })
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("ceo_conversations")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ── Messages ────────────────────────────────────────────────────────────────

export const getCeoChat = createServerFn({ method: "GET" })
  .inputValidator((d?: { conversationId?: string | null }) => ({
    conversationId: d?.conversationId ?? null,
  }))
  .handler(async ({ data }) => {
    if (!data.conversationId) return [];
    const { data: messages, error } = await supabaseAdmin
      .from("ceo_chat_messages")
      .select("id, role, content, created_at, artifact_json, model_used")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw error;

    const ids = (messages ?? []).map((m) => m.id);
    let attachments: Array<{
      id: string;
      message_id: string | null;
      filename: string;
      mime_type: string;
      size_bytes: number;
    }> = [];
    if (ids.length) {
      const { data: atts } = await supabaseAdmin
        .from("ceo_chat_attachments")
        .select("id, message_id, filename, mime_type, size_bytes")
        .in("message_id", ids);
      attachments = atts ?? [];
    }

    // Generate signed URLs for media attachments so the UI can render
    // images/videos inline. chat-uploads is a private bucket.
    const signedUrlMap = new Map<string, string>();
    for (const a of attachments) {
      const mt = a.mime_type ?? "";
      if (!mt.startsWith("image/") && !mt.startsWith("video/") && !mt.startsWith("audio/")) continue;
      const { data: row } = await supabaseAdmin
        .from("ceo_chat_attachments")
        .select("storage_path")
        .eq("id", a.id)
        .maybeSingle();
      if (!row?.storage_path) continue;
      const { data: signed } = await supabaseAdmin.storage
        .from("chat-uploads")
        .createSignedUrl(row.storage_path, 3600);
      if (signed?.signedUrl) signedUrlMap.set(a.id, signed.signedUrl);
    }

    return (messages ?? []).map((m) => ({
      ...m,
      attachments: attachments
        .filter((a) => a.message_id === m.id)
        .map((a) => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mime_type,
          sizeBytes: a.size_bytes,
          url: signedUrlMap.get(a.id) ?? null,
        })),
    }));
  });

export const uploadCeoAttachment = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { filename: string; mimeType: string; base64: string }) => {
      const filename = (d?.filename ?? "").trim();
      const mimeType = (d?.mimeType ?? "application/octet-stream").trim();
      const base64 = d?.base64 ?? "";
      if (!filename) throw new Error("Missing filename");
      if (!base64) throw new Error("Missing file content");
      return { filename, mimeType, base64 };
    },
  )
  .handler(async ({ data }) => {
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length === 0) throw new Error("Empty file");
    if (bytes.length > MAX_UPLOAD_BYTES)
      throw new Error("File exceeds 10MB limit");

    const lower = data.filename.toLowerCase();
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${crypto.randomUUID()}-${safeName}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("chat-uploads")
      .upload(storagePath, bytes, {
        contentType: data.mimeType,
        upsert: false,
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const isImage =
      data.mimeType.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/i.test(lower);

    let extracted = "";
    try {
      if (isImage) {
        // Images are sent to the model directly as multimodal parts;
        // no text extraction needed.
        extracted = "";
      } else if (lower.endsWith(".txt") || lower.endsWith(".md") || data.mimeType.startsWith("text/")) {
        extracted = bytes.toString("utf-8");
      } else if (lower.endsWith(".pdf") || data.mimeType === "application/pdf") {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const { text } = await extractText(pdf, { mergePages: true });
        extracted = Array.isArray(text) ? text.join("\n") : text;
      } else if (lower.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({
          buffer: bytes,
        } as any);
        extracted = value;
      } else {
        extracted = `[Unsupported file type: ${data.mimeType || lower}]`;
      }
    } catch (e: any) {
      extracted = `[Failed to extract text: ${e?.message ?? "unknown error"}]`;
    }

    if (extracted.length > MAX_EXTRACTED_CHARS) {
      extracted =
        extracted.slice(0, MAX_EXTRACTED_CHARS) +
        `\n\n[truncated — ${extracted.length - MAX_EXTRACTED_CHARS} more chars omitted]`;
    }

    const { data: row, error: insErr } = await supabaseAdmin
      .from("ceo_chat_attachments")
      .insert({
        filename: data.filename,
        mime_type: data.mimeType,
        size_bytes: bytes.length,
        storage_path: storagePath,
        extracted_text: extracted,
      })
      .select("id, filename, mime_type, size_bytes")
      .single();
    if (insErr) throw insErr;

    return {
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
    };
  });

export const sendCeoMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      content: string;
      model?: string;
      attachmentIds?: string[];
      conversationId?: string | null;
    }) => {
      const c = (d?.content ?? "").trim();
      const attachmentIds = Array.isArray(d?.attachmentIds) ? d.attachmentIds : [];
      if (!c && attachmentIds.length === 0)
        throw new Error("Message is empty");
      if (c.length > 8000) throw new Error("Message too long");
      return {
        content: c,
        model: d?.model ?? undefined,
        attachmentIds,
        conversationId: d?.conversationId ?? null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const handlerContext = context as { userId?: string; claims?: { email?: string } };
    const callerEmail = handlerContext.claims?.email ?? null;
    const callerIsOwner = isVdnxOwner(callerEmail);
    const ceoSystem = buildCeoSystem(callerEmail);
    if (handlerContext.userId) {
      await assertModelAllowedForUser({ userId: handlerContext.userId, modelId: data.model ?? null });
    }
    // /video <prompt> → Kling v3.0 Std via Replicate
    const videoSlash = data.content.match(/^\/video\b[\s:@-]*([\s\S]*)$/i);
    if (videoSlash && data.attachmentIds.length === 0) {
      return (await generateCeoVideo({
        data: {
          prompt: videoSlash[1].trim(),
          conversationId: data.conversationId ?? null,
        },
      })) as any;
    }

    // If the Kling video model is selected in the picker, treat the message
    // as a video prompt (same as /video).
    if (data.model === "kling" && data.attachmentIds.length === 0 && data.content) {
      return (await generateCeoVideo({
        data: {
          prompt: data.content,
          conversationId: data.conversationId ?? null,
        },
      })) as any;
    }

    // Reroute stray slash-commands (e.g. "/pdf@topic", "/docx topic") that bypassed the client parser.
    const slash = data.content.match(/^\/(pdf|docx)\b[\s:@-]*([\s\S]*)$/i);
    if (slash && data.attachmentIds.length === 0) {
      return (await generateCeoDocument({
        data: {
          kind: slash[1].toLowerCase() as "pdf" | "docx",
          topic: slash[2].trim(),
          conversationId: data.conversationId ?? null,
          model: data.model,
        },
      })) as any;
    }

    // /search <query> — live web search via Firecrawl, then synthesized reply with citations.
    const searchSlash = data.content.match(/^\/search\b[\s:@-]*([\s\S]*)$/i);
    if (searchSlash && data.attachmentIds.length === 0) {
      const q = searchSlash[1].trim();
      if (!q) throw new Error("Usage: /search <query>");
      const convId = await ensureCeoConversation({
        conversationId: data.conversationId,
        title: `Search: ${q}`,
      });
      await insertCeoChatMessage({ role: "user", content: data.content, conversationId: convId, title: q, select: "id" });
      let assistantMd: string;
      try {
        const results = await webSearch(q, 6);
        if (!results.length) {
          assistantMd = `**No web results** for \`${q}\`.`;
        } else {
          const block = results
            .map((r, i) => `[${i + 1}] **${r.title ?? r.url}** — ${r.url}\n${r.description ?? ""}`)
            .join("\n\n");
          const json = await chatCompletion({
            model: resolveTextChatModel(data.model),
            temperature: 0.4,
            messages: [
              { role: "system", content: CEO_SYSTEM },
              {
                role: "user",
                content:
                  `Web search query: "${q}"\n\nResults:\n\n${block}\n\n` +
                  `Synthesize a tight, founder-grade answer grounded ONLY in these results. ` +
                  `Cite sources inline as [domain](url). End with a "Sources" list.`,
              },
            ],
          });
          assistantMd = json?.choices?.[0]?.message?.content?.trim() || `_(no synthesis)_\n\n${block}`;
        }
      } catch (e: any) {
        assistantMd = `**Web search failed:** ${e?.message ?? "unknown error"}`;
      }
      return await (async () => {
        const { data: saved, conversationId: finalId } = await insertCeoChatMessage({
          role: "assistant", content: assistantMd, conversationId: convId, title: q, select: "id, role, content, created_at",
        });
        await supabaseAdmin.from("ceo_conversations").update({ updated_at: new Date().toISOString() }).eq("id", finalId!);
        return { ...saved, conversation_id: finalId };
      })();
    }

    // /fetch <url> — scrape a page via Firecrawl, then summarize.
    const fetchSlash = data.content.match(/^\/fetch\b[\s:@-]*([\s\S]*)$/i);
    if (fetchSlash && data.attachmentIds.length === 0) {
      const u = fetchSlash[1].trim();
      if (!u) throw new Error("Usage: /fetch <url>");
      const convId = await ensureCeoConversation({
        conversationId: data.conversationId,
        title: `Fetch: ${u}`,
      });
      await insertCeoChatMessage({ role: "user", content: data.content, conversationId: convId, title: u, select: "id" });
      let assistantMd: string;
      try {
        const page = await webFetch(u);
        const json = await chatCompletion({
          model: resolveTextChatModel(data.model),
          temperature: 0.4,
          messages: [
            { role: "system", content: CEO_SYSTEM },
            {
              role: "user",
              content:
                `Fetched page: ${page.title ?? page.url}\nURL: ${page.url}\n\n--- PAGE CONTENT (markdown) ---\n${page.markdown}\n--- END ---\n\n` +
                `Summarize the key points, then give a sharp CEO-grade take. Cite as [${new URL(page.url).hostname}](${page.url}).`,
            },
          ],
        });
        assistantMd = json?.choices?.[0]?.message?.content?.trim() || `_(no summary)_`;
      } catch (e: any) {
        assistantMd = `**Fetch failed:** ${e?.message ?? "unknown error"}`;
      }
      return await (async () => {
        const { data: saved, conversationId: finalId } = await insertCeoChatMessage({
          role: "assistant", content: assistantMd, conversationId: convId, title: u, select: "id, role, content, created_at",
        });
        await supabaseAdmin.from("ceo_conversations").update({ updated_at: new Date().toISOString() }).eq("id", finalId!);
        return { ...saved, conversation_id: finalId };
      })();
    }

    // /repo <ls|cat|search|overview> <owner/repo>[/path] [query] — read public/private repos via GitHub.
    const repoSlash = data.content.match(/^\/repo\b[\s:@-]*([\s\S]*)$/i);
    if (repoSlash && data.attachmentIds.length === 0) {
      const rest = repoSlash[1].trim();
      if (!rest) throw new Error("Usage: /repo ls <owner/repo>[/path]  |  /repo cat <owner/repo>/<file>  |  /repo search <owner/repo> <query>  |  /repo <owner/repo> (overview)");

      const convId = await ensureCeoConversation({
        conversationId: data.conversationId,
        title: `Repo: ${rest.slice(0, 60)}`,
      });
      await insertCeoChatMessage({ role: "user", content: data.content, conversationId: convId, title: rest, select: "id" });

      let assistantMd: string;
      try {
        const tokens = rest.split(/\s+/);
        const verbs = new Set(["ls", "list", "cat", "read", "search", "find", "overview", "show"]);
        const hasVerb = verbs.has(tokens[0].toLowerCase());
        const verb = hasVerb ? tokens[0].toLowerCase() : "overview";
        const target = hasVerb ? tokens[1] ?? "" : tokens[0];
        const extra = (hasVerb ? tokens.slice(2) : tokens.slice(1)).join(" ").trim();
        if (!target) throw new Error("Missing repo. Use owner/repo or a GitHub URL.");

        const { repo, path } = parseRepoTarget(target);

        let contextBlock = "";
        let userInstruction = "";

        if (verb === "ls" || verb === "list") {
          const r = await listRepoDir(path, repo);
          const lines = r.entries.map((e) => `- ${e.type === "dir" ? "📁" : "📄"} \`${e.path}\`${e.size ? ` (${e.size}b)` : ""}`).join("\n");
          contextBlock = `Listing \`${r.repo}/${r.path || ""}\`:\n\n${lines || "_(empty)_"}`;
          userInstruction = `Summarize what this directory contains and what the repo likely does at a glance.`;
        } else if (verb === "cat" || verb === "read") {
          if (!path) throw new Error("/repo cat needs a file path.");
          const f = await readRepoFile(path, repo);
          contextBlock = `File \`${f.repo}/${f.path}\` (${f.size} bytes${f.truncated ? ", truncated" : ""}):\n\n\`\`\`\n${f.content}\n\`\`\``;
          userInstruction = `Explain what this file does. Call out key entry points, risky parts, and suggested improvements (CEO-grade, terse).`;
        } else if (verb === "search" || verb === "find") {
          const q = extra || path;
          if (!q) throw new Error("/repo search needs a query.");
          const r = await searchRepoCode(q, repo);
          const lines = r.matches.map((m) => `- \`${m.path}\`${m.snippet ? ` — ${m.snippet.replace(/\s+/g, " ").slice(0, 160)}` : ""}`).join("\n");
          contextBlock = `Code search in \`${r.repo}\` for \`${r.query}\`:\n\n${lines || "_(no matches)_"}`;
          userInstruction = `Synthesize what these matches tell us. Recommend which files to open next.`;
        } else {
          // overview: list root + try README
          const r = await listRepoDir(path || "", repo);
          const lines = r.entries.map((e) => `- ${e.type === "dir" ? "📁" : "📄"} \`${e.path}\``).join("\n");
          let readme = "";
          const readmeEntry = r.entries.find((e) => /^readme(\.|$)/i.test(e.name));
          if (readmeEntry) {
            try {
              const f = await readRepoFile(readmeEntry.path, repo);
              readme = `\n\n### README (\`${f.path}\`)\n\n${f.content.slice(0, 4000)}`;
            } catch { /* ignore */ }
          }
          contextBlock = `Repository \`${r.repo}\` — root listing:\n\n${lines}${readme}`;
          userInstruction = `Give a sharp executive overview: what this repo is, who it's for, its architecture, and 3 immediate observations or risks.`;
        }

        const json = await chatCompletion({
          model: resolveTextChatModel(data.model),
          temperature: 0.4,
          messages: [
            { role: "system", content: CEO_SYSTEM },
            { role: "user", content: `${contextBlock}\n\n---\n\n${userInstruction}` },
          ],
        });
        const synth = json?.choices?.[0]?.message?.content?.trim() || "_(no synthesis)_";
        assistantMd = `${synth}\n\n<details><summary>Raw repo data</summary>\n\n${contextBlock}\n\n</details>`;
      } catch (e: any) {
        assistantMd = `**/repo failed:** ${e?.message ?? "unknown error"}`;
      }

      const { data: saved, conversationId: finalId } = await insertCeoChatMessage({
        role: "assistant", content: assistantMd, conversationId: convId, title: rest, select: "id, role, content, created_at",
      });
      await supabaseAdmin.from("ceo_conversations").update({ updated_at: new Date().toISOString() }).eq("id", finalId!);
      return { ...saved, conversation_id: finalId };
    }

    let conversationId = await ensureCeoConversation({
      conversationId: data.conversationId,
      title: data.content || "New conversation",
    });

    // Load attachments (if any) for prompt augmentation
    let attachmentBlock = "";
    let attachmentRows: Array<{ id: string; filename: string }> = [];
    const imageParts: Array<{ type: "image_url"; image_url: { url: string } }> = [];
    if (data.attachmentIds.length) {
      const { data: atts, error: attErr } = await supabaseAdmin
        .from("ceo_chat_attachments")
        .select("id, filename, mime_type, storage_path, extracted_text")
        .in("id", data.attachmentIds)
        .is("message_id", null);
      if (attErr) throw attErr;
      attachmentRows = (atts ?? []).map((a) => ({ id: a.id, filename: a.filename }));

      const textAtts = (atts ?? []).filter(
        (a) => !(a.mime_type ?? "").startsWith("image/"),
      );
      const imgAtts = (atts ?? []).filter((a) =>
        (a.mime_type ?? "").startsWith("image/"),
      );

      if (textAtts.length) {
        attachmentBlock =
          "\n\n## Attached documents\n" +
          textAtts
            .map(
              (a) =>
                `### ${a.filename}\n\n${a.extracted_text ?? "[no extracted text]"}`,
            )
            .join("\n\n---\n\n");
      }

      for (const a of imgAtts) {
        if (!a.storage_path) continue;
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from("chat-uploads")
          .createSignedUrl(a.storage_path, 3600);
        if (signErr || !signed?.signedUrl) continue;
        imageParts.push({
          type: "image_url",
          image_url: { url: signed.signedUrl },
        });
      }
    }

    // Auto-fetch URLs pasted into a normal message (skip @mention dispatch and slash commands).
    const isMention = /^@(board|[a-z]+)\s+/i.test(data.content);
    if (!isMention) {
      const urls = extractUrls(data.content).slice(0, 3);
      if (urls.length) {
        const pages = await Promise.all(
          urls.map(async (u) => {
            try {
              const p = await webFetch(u);
              return `### ${p.title ?? p.url}\nURL: ${p.url}\n\n${p.markdown.slice(0, 6000)}`;
            } catch (e: any) {
              return `### ${u}\n[fetch failed: ${e?.message ?? "unknown"}]`;
            }
          }),
        );
        attachmentBlock += `\n\n## Fetched URLs\n\n${pages.join("\n\n---\n\n")}`;
      }
    }

    const resolvedModel = resolveChatModel(data.model);
    if (imageParts.length && resolvedModel === "nousresearch/hermes-4-405b") {
      throw new Error(
        "Hermes 4 405B can't read images. Pick Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, or DeepSeek V4 Pro to analyze attached images.",
      );
    }

    const userContentForModel = data.content + attachmentBlock;
    const userContentSaved = data.content;

    // Save user message
    const { data: userRow, conversationId: ensuredConversationId } = await insertCeoChatMessage({
      role: "user",
      content: userContentSaved,
      conversationId,
      title: data.content || "New conversation",
      select: "id",
    });
    conversationId = ensuredConversationId;
    if (!userRow?.id) throw new Error("Failed to save CEO chat message");

    // Link attachments to the new user message
    if (attachmentRows.length) {
      await supabaseAdmin
        .from("ceo_chat_attachments")
        .update({ message_id: userRow.id })
        .in(
          "id",
          attachmentRows.map((a) => a.id),
        );
    }

    // Build conversation history (scoped to this conversation, sans attachment text)
    const { data: history, error: histErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .select("id, role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(80);
    if (histErr) throw histErr;

    // bump conversation updated_at so it sorts to the top
    const bump = async () =>
      supabaseAdmin
        .from("ceo_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId!);

    const saveAssistant = async (markdown: string, modelOverride?: string | null) => {
      const { data: saved, conversationId: finalConversationId } = await insertCeoChatMessage({
        role: "assistant",
        content: markdown,
        conversationId,
        title: data.content || "New conversation",
        modelUsed: modelOverride ?? resolvedModel ?? null,
        select: "id, role, content, created_at, model_used",
      });
      conversationId = finalConversationId;
      await bump();
      return { ...saved, conversation_id: conversationId };
    };

    // ── @mention dispatch shortcut ────────────────────────────────────────
    const mention = data.content.match(/^@(board|[a-z]+)\s+([\s\S]+)$/i);
    if (mention) {
      const target = mention[1].toLowerCase();
      const prompt = mention[2].trim() + attachmentBlock;

      try {
        let assistantMd = "";
        if (target === "board") {
          const decision = await routePrompt({
            data: { prompt, force_boardroom: true, model: resolveTextChatModel(data.model) },
          });
          const result = await dispatch({
            data: {
              raw: data.content,
              agent_slug: decision.primary_agent,
              verb: decision.inferred_verb || "respond",
              args: prompt,
              boardroom: true,
              freeform: true,
              prompt,
              model: resolveTextChatModel(data.model),
            },
          });
          const consultLines = (result as any).consults?.length
            ? (result as any).consults
                .map(
                  (c: any) =>
                    `- **${c.role}** — ${c.consult.position.toUpperCase()}${c.consult.blocking ? " · BLOCKING" : ""}`,
                )
                .join("\n")
            : "_(no consults)_";
          assistantMd =
            `**Boardroom dispatched** — lead: \`${decision.primary_agent.toUpperCase()}\`` +
            `\n\n${artifactToMd((result as any).artifact)}` +
            `\n\n---\n**Consults:**\n${consultLines}` +
            ((result as any).requires_approval
              ? `\n\n⚠️ External approval gate triggered.`
              : "");
        } else if ((VALID_DISPATCH_SLUGS as readonly string[]).includes(target)) {
          const result = await dispatch({
            data: {
              raw: data.content,
              agent_slug: target,
              verb: "respond",
              args: prompt,
              freeform: true,
              prompt,
              model: resolveTextChatModel(data.model),
            },
          });
          if ((result as any).chat) {
            assistantMd = `**@${target.toUpperCase()} replied:**\n\n${(result as any).chat.reply_markdown}`;
          } else {
            assistantMd =
              `**@${target.toUpperCase()} dispatched:**\n\n${artifactToMd((result as any).artifact)}` +
              ((result as any).requires_approval
                ? `\n\n⚠️ External approval gate triggered.`
                : "");
          }
        }

        if (assistantMd) {
          return await saveAssistant(assistantMd);
        }
      } catch (e: any) {
        const errMd = `**Dispatch failed for @${target}:** ${e?.message ?? "unknown error"}`;
        return await saveAssistant(errMd);
      }
    }

    // ── LinkedIn auto-file removed. Users add drafts to Outbound explicitly
    //    via the "Add to Outbound" button on assistant messages.
    //    Email/reminder dispatch happens via @agent commands, not the chat
    //    intent classifier.


    // ── Normal CEO conversational reply ───────────────────────────────────
    // Detect LinkedIn authoring intent to enforce exact post count.
    const lowerContent = data.content.toLowerCase();
    const { parsePostCount, truncateToPostCount, splitPosts } = await import("@/server/chat-intent.server");
    const parsedCount = parsePostCount(data.content);
    const mentionsPost = /\b(linkedin|post|posts)\b/.test(lowerContent);
    const authoringVerb = /\b(write|draft|create|compose|generate|make|give me|give us|come up with|brainstorm|another|more|need|want)\b/.test(lowerContent);
    const numericPostAsk = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(more\s+)?(linkedin\s+)?(posts?|variants?|drafts?|options?|versions?|ideas?)\b/i.test(data.content);
    const prevAssistant = [...(history ?? [])].reverse().find((m) => m.role === "assistant")?.content ?? "";
    const prevWasLinkedIn = /linkedin|#\w+|\n---\n|###\s*Post\s*\d/i.test(prevAssistant) && prevAssistant.length > 200;
    const isLinkedInAuthoring =
      (mentionsPost && authoringVerb) ||
      (mentionsPost && parsedCount >= 2) ||
      numericPostAsk ||
      (prevWasLinkedIn && (authoringVerb || numericPostAsk));
    let systemPrompt = CEO_SYSTEM;
    let postCount = 1;
    if (isLinkedInAuthoring) {
      postCount = parsedCount;
      const rule =
        postCount === 1
          ? `=== LINKEDIN AUTHORING (MANDATORY) ===\nReturn EXACTLY 1 full LinkedIn post as plain markdown. No preamble, no meta commentary, no "here you go", no numbering, no '### Post 1' header. Just the post body (hook + body + CTA + 3–6 hashtags), 800–1600 chars.`
          : `=== LINKEDIN AUTHORING (MANDATORY) ===\nProduce EXACTLY ${postCount} full LinkedIn posts. No preamble, no meta commentary, no "here you go", no summary, no refusals.\nFormat strictly:\n### Post 1\n<full post body with hashtags>\n---\n### Post 2\n<full post body with hashtags>\n---\n… up to ### Post ${postCount}.\nEvery post must stand alone (hook + body + CTA + 3–6 hashtags), 800–1600 chars. Never say "you already wrote these" — always output the ${postCount} posts.`;
      systemPrompt = `${rule}\n\n${CEO_SYSTEM}`;
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map((m): ChatMessage => {
        if (m.id === userRow.id && imageParts.length) {
          return {
            role: "user",
            content: [
              { type: "text", text: userContentForModel },
              ...imageParts,
            ],
          };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.id === userRow.id ? userContentForModel : m.content,
        };
      }),
    ];

    let reply = await runChatWithWebTools({
      messages,
      model: resolvedModel,
      temperature: 0.6,
      ...(isLinkedInAuthoring ? { max_tokens: 16000 } : {}),
    });

    if (isLinkedInAuthoring) {
      // Strip a leading preamble paragraph (intro line like "Here are two fresh posts…")
      // before counting bodies, so the under-delivered check is honest.
      const stripPreamble = (text: string): string => {
        const trimmed = text.trim();
        const firstBreak = trimmed.search(/\n\s*\n/);
        if (firstBreak < 0) return trimmed;
        const head = trimmed.slice(0, firstBreak).trim();
        const looksLikePreamble =
          /^(here (are|is)|below (are|is)|sure|okay|got it|i(?:'|\u2019)?ve (drafted|written|got)|check (these|this) out|as requested|of course)/i.test(head) ||
          (head.length < 200 && !/#\w/.test(head) && !/[.!?]"?\s*$/.test(head));
        return looksLikePreamble ? trimmed.slice(firstBreak).replace(/^\s*(?:---+|\*\*\*+)\s*\n/, "").trim() : trimmed;
      };

      const isUnderDelivered = (text: string): boolean => {
        const stripped = stripPreamble(text);
        const bodies = splitPosts(stripped).filter((p) => p.length >= 200);
        if (bodies.length < postCount) return true;
        if (/\n\s*(?:---+|\*\*\*+)\s*$/.test(text.trim())) return bodies.length < postCount;
        if (text.trim().length < postCount * 300) return true;
        return false;
      };

      let attempts = 0;
      while (isUnderDelivered(reply) && attempts < 2) {
        attempts++;
        const retryMessages: ChatMessage[] = [
          ...messages,
          { role: "assistant", content: reply },
          {
            role: "user",
            content: `Return ONLY the ${postCount} LinkedIn post ${postCount === 1 ? "body" : "bodies separated by a line containing only '---'"}. No intro, no meta, no "here are", no "### Post" headers. Start directly with the first post's hook. Each post 800–1600 chars with 3–6 hashtags.`,
          },
        ];
        try {
          reply = await runChatWithWebTools({
            messages: retryMessages,
            model: resolvedModel,
            temperature: 0.4,
            max_tokens: 16000,
            disableTools: true,
          });
        } catch (e) {
          console.error("[linkedin retry]", e);
          break;
        }
      }
      reply = truncateToPostCount(reply, postCount);
    }




    return await saveAssistant(reply);
  });

// Compact markdown renderer for an Artifact (mirrors terminal artifactToMarkdown)
function artifactToMd(a: any): string {
  if (!a) return "_(no artifact)_";
  const sections = (a.sections ?? [])
    .map((s: any) => `### ${s.heading}\n\n${s.body_md}`)
    .join("\n\n");
  const items = (a.action_items ?? []).length
    ? `\n\n### Action Items\n\n| # | Task | Owner | Due | Auto |\n|---|------|-------|-----|------|\n${a.action_items
        .map(
          (it: any, i: number) =>
            `| ${i + 1} | ${it.task} | ${String(it.owner_agent).toUpperCase()} | ${it.due} | ${it.auto_dispatch ? "✓" : "gate"} |`,
        )
        .join("\n")}`
    : "";
  return `# ${a.title}\n\n${sections}${items}`;
}

export const clearCeoChat = createServerFn({ method: "POST" })
  .inputValidator((d?: { conversationId?: string | null }) => ({
    conversationId: d?.conversationId ?? null,
  }))
  .handler(async ({ data }) => {
    if (!data.conversationId) return { ok: true };
    const { error } = await supabaseAdmin
      .from("ceo_chat_messages")
      .delete()
      .eq("conversation_id", data.conversationId);
    if (error) throw error;
    return { ok: true };
  });
