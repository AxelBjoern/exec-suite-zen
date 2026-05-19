import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, type ChatMessage } from "@/server/llm.server";
import { DEFAULT_COMPANY_CONTEXT } from "@/lib/agent-prompts";

const CEO_SYSTEM = `${DEFAULT_COMPANY_CONTEXT}

You are the VDNX CEO Agent in conversational chat mode with the operator.

Rules:
- Talk like a sharp, decisive chief executive. Direct, founder-grade, no filler, active voice.
- Markdown is welcome (headings, bullets, tables) but keep replies tight unless asked for depth.
- Never invent metrics or commitments. If you don't know, say so and propose how to find out.
- This is conversational — do NOT emit JSON, tool calls, or "Artifact" sections unless the operator explicitly asks for a deliverable.
- You can reference VDNX's specialist agents (CFO, COO, CTO, CMO, CCO, sales, linkedin, social, seo) and suggest delegating, but you cannot dispatch them from this chat.`;

export const getCeoChat = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("ceo_chat_messages")
    .select("id, role, content, created_at")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return data ?? [];
});

export const sendCeoMessage = createServerFn({ method: "POST" })
  .inputValidator((d: { content: string }) => {
    const c = (d?.content ?? "").trim();
    if (!c) throw new Error("Message is empty");
    if (c.length > 8000) throw new Error("Message too long");
    return { content: c };
  })
  .handler(async ({ data }) => {
    const { error: insErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({ role: "user", content: data.content });
    if (insErr) throw insErr;

    const { data: history, error: histErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .select("role, content")
      .order("created_at", { ascending: true })
      .limit(80);
    if (histErr) throw histErr;

    const messages: ChatMessage[] = [
      { role: "system", content: CEO_SYSTEM },
      ...(history ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const json = await chatCompletion({ messages, temperature: 0.6 });
    const reply: string =
      json?.choices?.[0]?.message?.content?.trim() ||
      "(no reply)";

    const { data: saved, error: saveErr } = await supabaseAdmin
      .from("ceo_chat_messages")
      .insert({ role: "assistant", content: reply })
      .select("id, role, content, created_at")
      .single();
    if (saveErr) throw saveErr;

    return saved;
  });

export const clearCeoChat = createServerFn({ method: "POST" }).handler(async () => {
  const { error } = await supabaseAdmin
    .from("ceo_chat_messages")
    .delete()
    .gte("created_at", "1970-01-01");
  if (error) throw error;
  return { ok: true };
});
