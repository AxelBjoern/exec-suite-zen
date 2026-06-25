import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatCompletion, resolveTextChatModel } from "@/server/llm.server";
import { VIBE_CODER_AUTOMATOR_PROMPT } from "@/lib/vibe-coder-prompt";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(50_000),
});

const PreviewType = z.enum(["markdown", "tsx", "ts", "json", "mermaid", "text", "html", "image"]);

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cowork_sessions")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const getSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cowork_sessions").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ title: z.string().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cowork_sessions")
      .insert({ user_id: context.userId, title: data.title ?? "Untitled session" })
      .select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    messages: z.array(MessageSchema).max(500).optional(),
    preview_content: z.string().max(200_000).optional(),
    preview_type: PreviewType.optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("cowork_sessions").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const applyPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cowork_sessions").select("preview_content, preview_type, title").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { error: upErr } = await context.supabase
      .from("cowork_sessions").update({ applied_content: row.preview_content }).eq("id", data.id).select().single();
    if (upErr) throw new Error(upErr.message);
    const payload = { session_id: data.id, preview_type: row.preview_type, title: row.title, length: row.preview_content?.length ?? 0 };
    const hash_self = await sha256Hex(JSON.stringify(payload));
    await context.supabase.from("audit_log").insert({
      actor: context.userId, agent_slug: "vibe-coder", action: "cowork.preview_applied",
      target: data.id, payload, hash_self,
    });
    return { ok: true };
  });

export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cowork_sessions").delete().eq("id", data.id).select();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const vibeChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    messages: z.array(MessageSchema).min(1).max(80),
    model: z.string().min(1).max(80).optional(),
    use_tools: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const model = resolveTextChatModel(data.model ?? "grok");
    const nonSystem = data.messages.filter((m) => m.role !== "system");
    if (data.use_tools !== false) {
      const { callAgentTool } = await import("@/server/llm.server");
      const lastUser = [...nonSystem].reverse().find((m) => m.role === "user");
      const history = nonSystem.slice(0, -1)
        .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 4000)}`).join("\n\n");
      const system = `${VIBE_CODER_AUTOMATOR_PROMPT}\n\nYou have access to tools (web.search, web.fetch, image.generate, vdnx.http_probe, browser.run for the self-hosted Playwright worker driving vdnx.app's built-in calendar / legacy pages, plus draft tools for email & LinkedIn). Call them whenever useful, then reply in markdown.${history ? `\n\nConversation so far:\n${history}` : ""}`;
      const res = await callAgentTool({
        agent_slug: "cowork", system, user: lastUser?.content ?? "", model,
        context: { owner_user_id: context.userId },
      });
      const toolNote = res.toolCalls.length
        ? `\n\n<sub>_Used tools: ${res.toolCalls.map((t) => t.name).join(", ")}_</sub>` : "";
      return { text: (res.finalMessage || "").trim() + toolNote, model, tool_calls: res.toolCalls };
    }
    const res = await chatCompletion({
      model,
      messages: [
        { role: "system", content: VIBE_CODER_AUTOMATOR_PROMPT },
        ...nonSystem,
      ],
      temperature: 0.4,
    });
    const text: string = res?.choices?.[0]?.message?.content ?? "";
    return { text, model, tool_calls: [] };
  });

export const autoTitleSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    messages: z.array(MessageSchema).min(1).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const convo = data.messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 1200)}`)
      .join("\n\n")
      .slice(0, 4000);
    const model = resolveTextChatModel("deepseek-flash");
    const res = await chatCompletion({
      model,
      messages: [
        { role: "system", content: "You name chat sessions. Reply with ONLY a concise 2-5 word title in Title Case. No quotes, no punctuation, no trailing period." },
        { role: "user", content: `Title this session:\n\n${convo}` },
      ],
      temperature: 0.3,
    });
    let title: string = (res?.choices?.[0]?.message?.content ?? "").trim();
    title = title.replace(/^["'`]+|["'`]+$/g, "").replace(/\.$/, "").slice(0, 80);
    if (!title) title = "Untitled session";
    const { error } = await context.supabase
      .from("cowork_sessions").update({ title }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { title };
  });

