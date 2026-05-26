import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  chatCompletion,
  resolveChatModel,
  type ChatMessage,
} from "@/server/llm.server";
import { DEFAULT_COMPANY_CONTEXT } from "@/lib/agent-prompts";
import { dispatch, routePrompt } from "@/serverfns/terminal.functions";
import {
  renderDocx,
  renderPdf,
  type DocOutline,
} from "@/server/doc-generator.server";

const VALID_DISPATCH_SLUGS = [
  "ceo", "cfo", "coo", "cto", "cmo", "cco", "sales", "linkedin", "social", "seo",
] as const;

const CEO_SYSTEM = `${DEFAULT_COMPANY_CONTEXT}

You are the VDNX CEO Agent in conversational chat mode with the operator.

Rules:
- Talk like a sharp, decisive chief executive. Direct, founder-grade, no filler, active voice.
- Markdown is welcome (headings, bullets, tables) but keep replies tight unless asked for depth.
- Never invent metrics or commitments. If you don't know, say so and propose how to find out.
- This is conversational — do NOT emit JSON, tool calls, or "Artifact" sections unless the operator explicitly asks for a deliverable.
- **NEVER fabricate file links, download URLs, or storage paths.** Documents are produced ONLY by the /pdf and /docx slash commands; you have no ability to upload files. If the operator wants a file, instruct them to type \`/pdf <topic>\` or \`/docx <topic>\` — do not write a Markdown download link yourself.
- You CAN dispatch specialist agents directly from this chat. Tell the operator they can prefix a message with @cfo, @coo, @cto, @cmo, @cco, @sales, @linkedin, @social, @seo to dispatch that specialist, or @board to convene a cross-functional boardroom. The dispatched artifact will appear inline.
- The operator can also generate downloadable documents: \`/pdf <topic>\` produces a PDF and \`/docx <topic>\` produces a Word document. Mention this when relevant (e.g., "want this as a PDF? Type \`/pdf <topic>\`").
- When the operator attaches documents, read the content provided under "Attached documents" and ground your reply in it.`;

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

async function ensureCeoConversation(opts: {
  conversationId?: string | null;
  title?: string | null;
}) {
  const desiredId = opts.conversationId ?? null;
  const title = conversationTitleFromText(opts.title);

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

    const { data: recreated, error: recreateErr } = await supabaseAdmin
      .from("ceo_conversations")
      .insert({ id: desiredId, title })
      .select("id")
      .single();

    if (!recreateErr && recreated?.id) return recreated.id;

    const recreateMessage = recreateErr?.message ?? "";
    if (
      recreateErr &&
      !/invalid input syntax for type uuid/i.test(recreateMessage) &&
      !/duplicate key value violates unique constraint/i.test(recreateMessage)
    ) {
      throw recreateErr;
    }

    const { data: afterRace, error: afterRaceErr } = await supabaseAdmin
      .from("ceo_conversations")
      .select("id")
      .eq("id", desiredId)
      .maybeSingle();
    if (afterRaceErr) throw afterRaceErr;
    if (afterRace?.id) return afterRace.id;
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
      .select("id, role, content, created_at, artifact_json")
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

    return (messages ?? []).map((m) => ({
      ...m,
      attachments: attachments
        .filter((a) => a.message_id === m.id)
        .map((a) => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mime_type,
          sizeBytes: a.size_bytes,
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

    let extracted = "";
    try {
      if (lower.endsWith(".txt") || lower.endsWith(".md") || data.mimeType.startsWith("text/")) {
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
  .handler(async ({ data }) => {
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

    // Ensure a conversation exists; create one if needed (auto-title from first message)
    let conversationId = await ensureCeoConversation({
      conversationId: data.conversationId,
      title: data.content || "New conversation",
    });

    // Load attachments (if any) for prompt augmentation
    let attachmentBlock = "";
    let attachmentRows: Array<{ id: string; filename: string }> = [];
    if (data.attachmentIds.length) {
      const { data: atts, error: attErr } = await supabaseAdmin
        .from("ceo_chat_attachments")
        .select("id, filename, extracted_text")
        .in("id", data.attachmentIds)
        .is("message_id", null);
      if (attErr) throw attErr;
      attachmentRows = (atts ?? []).map((a) => ({ id: a.id, filename: a.filename }));
      if (atts && atts.length) {
        attachmentBlock =
          "\n\n## Attached documents\n" +
          atts
            .map(
              (a) =>
                `### ${a.filename}\n\n${a.extracted_text ?? "[no extracted text]"}`,
            )
            .join("\n\n---\n\n");
      }
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

    const saveAssistant = async (markdown: string) => {
      const { data: saved, conversationId: finalConversationId } = await insertCeoChatMessage({
        role: "assistant",
        content: markdown,
        conversationId,
        title: data.content || "New conversation",
        select: "id, role, content, created_at",
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
            data: { prompt, force_boardroom: true, model: data.model },
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
              model: data.model,
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
              model: data.model,
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

    // ── Normal CEO conversational reply ───────────────────────────────────
    const messages: ChatMessage[] = [
      { role: "system", content: CEO_SYSTEM },
      ...(history ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.id === userRow.id ? userContentForModel : m.content,
      })),
    ];

    const json = await chatCompletion({
      messages,
      temperature: 0.6,
      model: resolveChatModel(data.model),
    });
    const reply: string =
      json?.choices?.[0]?.message?.content?.trim() || "(no reply)";

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
