// Slice B — Chat Projects (workspace memory).
// Users can group conversations under a Project and give it a shared system
// prompt that gets prepended for both Direct and Swarm replies. Additive:
// conversations without a project behave exactly as before.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ChatProject = {
  id: string;
  name: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
};

export const listChatProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chat_projects")
      .select("id,name,system_prompt,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatProject[];
  });

export const createChatProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as { name?: string; system_prompt?: string };
    const name = (v?.name ?? "").trim();
    if (!name) throw new Error("Name required");
    return {
      name: name.slice(0, 120),
      system_prompt: (v?.system_prompt ?? "").slice(0, 8000),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("chat_projects")
      .insert({ user_id: context.userId, name: data.name, system_prompt: data.system_prompt })
      .select("id,name,system_prompt,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as ChatProject;
  });

export const updateChatProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as { id?: string; name?: string; system_prompt?: string };
    if (!v?.id) throw new Error("id required");
    return {
      id: v.id,
      name: typeof v.name === "string" ? v.name.trim().slice(0, 120) : undefined,
      system_prompt:
        typeof v.system_prompt === "string" ? v.system_prompt.slice(0, 8000) : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const patch: { name?: string; system_prompt?: string } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.system_prompt !== undefined) patch.system_prompt = data.system_prompt;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await context.supabase
      .from("chat_projects")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChatProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as { id?: string };
    if (!v?.id) throw new Error("id required");
    return { id: v.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chat_projects")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignConversationToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as { conversationId?: string; projectId?: string | null };
    if (!v?.conversationId) throw new Error("conversationId required");
    return {
      conversationId: v.conversationId,
      projectId: v.projectId ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ceo_conversations")
      .update({ project_id: data.projectId })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
