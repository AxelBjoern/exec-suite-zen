import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  chatCompletion,
  resolveChatModel,
  type ChatMessage,
} from "@/server/llm.server";
import { DEFAULT_COMPANY_CONTEXT } from "@/lib/agent-prompts";
import { dispatch, routePrompt } from "@/serverfns/terminal.functions";

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
- You CAN dispatch specialist agents directly from this chat. Tell the operator they can prefix a message with @cfo, @coo, @cto, @cmo, @cco, @sales, @linkedin, @social, @seo to dispatch that specialist, or @board to convene a cross-functional boardroom. The dispatched artifact will appear inline.
- When the operator attaches documents, read the content provided under "Attached documents" and ground your reply in it.`;

const MAX_EXTRACTED_CHARS = 30_000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const getCeoChat = createServerFn({ method: "GET" }).handler(async () => {
  const { data: messages, error } = await supabaseAdmin
    .from("ceo_chat_messages")
    .select("id, role, content, created_at")
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
    (d: { content: string; model?: string; attachmentIds?: string[] }) => {
      const c = (d?.content ?? "").trim();
      const attachmentIds = Array.isArray(d?.attachmentIds) ? d.attachmentIds : [];
      if (!c && attachmentIds.length === 0)
        throw new Error("Message is empty");
      if (c.length > 8000) throw new Error("Message too long");
      return {
        content: c,
        model: d?.model ?? undefined,
        attachmentIds,
      };
    },
  )
  .handler(async ({ data }) => {
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
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({ role: "user", content: userContentSaved })
      .select("id")
      .single();
    if (userErr) throw userErr;

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

    // Build conversation history (saved, sans attachment text)
    const { data: history, error: histErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .select("id, role, content")
      .order("created_at", { ascending: true })
      .limit(80);
    if (histErr) throw histErr;

    // ── @mention dispatch shortcut ────────────────────────────────────────
    // Recognize:  "@board <prompt>"  or  "@<slug> <prompt>" at the start.
    const mention = data.content.match(/^@(board|[a-z]+)\s+([\s\S]+)$/i);
    if (mention) {
      const target = mention[1].toLowerCase();
      const prompt = mention[2].trim() + attachmentBlock;

      try {
        let assistantMd = "";
        if (target === "board") {
          // Route to best primary, then dispatch as boardroom
          const decision = await routePrompt({
            data: { prompt, force_boardroom: true },
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
          const { data: saved, error: saveErr } = await supabaseAdmin
            .from("ceo_chat_messages")
            .insert({ role: "assistant", content: assistantMd })
            .select("id, role, content, created_at")
            .single();
          if (saveErr) throw saveErr;
          return saved;
        }
      } catch (e: any) {
        const errMd = `**Dispatch failed for @${target}:** ${e?.message ?? "unknown error"}`;
        const { data: saved } = await supabaseAdmin
          .from("ceo_chat_messages")
          .insert({ role: "assistant", content: errMd })
          .select("id, role, content, created_at")
          .single();
        return saved;
      }
    }

    // ── Normal CEO conversational reply ───────────────────────────────────
    const messages: ChatMessage[] = [
      { role: "system", content: CEO_SYSTEM },
      ...(history ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        // Inject attachment block into the just-saved user message only
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

    const { data: saved, error: saveErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({ role: "assistant", content: reply })
      .select("id, role, content, created_at")
      .single();
    if (saveErr) throw saveErr;

    return saved;
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

export const clearCeoChat = createServerFn({ method: "POST" }).handler(async () => {
  const { error } = await supabaseAdmin
    .from("ceo_chat_messages")
    .delete()
    .gte("created_at", "1970-01-01");
  if (error) throw error;
  return { ok: true };
});
