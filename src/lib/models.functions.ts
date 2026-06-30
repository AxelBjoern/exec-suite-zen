// Per-user chat model allowlist. Null/empty in DB means "all 8 allowed".
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CHAT_MODEL_OPTIONS, type ChatModelId } from "@/lib/chat-models";

const ALL_IDS = CHAT_MODEL_OPTIONS.map((m) => m.id) as ChatModelId[];
const ALL_ID_SET = new Set<string>(ALL_IDS);

export const getMyModelAllowlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { data } = await supabaseAdmin
      .from("user_settings")
      .select("chat_model_allowlist")
      .eq("user_id", userId)
      .maybeSingle();
    const stored = (data?.chat_model_allowlist ?? null) as string[] | null;
    const allowed =
      stored && stored.length
        ? (stored.filter((id) => ALL_ID_SET.has(id)) as ChatModelId[])
        : ALL_IDS;
    return { allowed, isDefault: !stored || stored.length === 0 };
  });

const Input = z.object({
  allowed: z.array(z.string()).min(1, "Pick at least one model"),
});

export const updateMyModelAllowlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const cleaned = Array.from(
      new Set(data.allowed.filter((id) => ALL_ID_SET.has(id))),
    );
    if (cleaned.length === 0) throw new Error("Pick at least one valid model");
    const { error } = await supabaseAdmin
      .from("user_settings")
      .upsert(
        { user_id: userId, chat_model_allowlist: cleaned },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, allowed: cleaned as ChatModelId[] };
  });

/** No-op: chat has no per-user model limits. Any model in CHAT_MODEL_OPTIONS is allowed. */
export async function assertModelAllowedForUser(_opts: {
  userId: string;
  modelId?: string | null;
}) {
  return;
}

