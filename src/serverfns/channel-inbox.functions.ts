// Server functions for the Channel Inbox settings UI:
// - listChannelBindings: bindings owned by the current user
// - createTelegramLinkCode: mint a one-time /link code (expires in 15 min)
// - setChannelAutoReply / deleteChannelBinding
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomCode(n = 6): string {
  const alph = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < n; i++) out += alph[Math.floor(Math.random() * alph.length)];
  return out;
}

export const listChannelBindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("channel_bindings")
      .select("id, channel, external_chat_id, link_code, link_expires_at, verified_at, auto_reply, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTelegramLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const code = randomCode(6);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("channel_bindings")
      .insert({
        owner_id: userId,
        channel: "telegram",
        link_code: code,
        link_expires_at: expiresAt,
      })
      .select("id, link_code, link_expires_at")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const setChannelAutoReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; auto_reply: boolean }) => ({
    id: String(d.id), auto_reply: !!d.auto_reply,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("channel_bindings")
      .update({ auto_reply: data.auto_reply })
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChannelBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("channel_bindings")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
