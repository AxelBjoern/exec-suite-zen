// Per-user chat model allowlist. Null/empty in DB means every visible model is allowed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT_MODEL_OPTIONS, type ChatModelOption } from "@/lib/chat-models";

type StoredSettings = {
  chat_model_allowlist: string[] | null;
  updated_at: string | null;
};

type BaseModelRow = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  description: string | null;
  owner_id: string | null;
  is_public: boolean | null;
  created_at: string | null;
};

const DEFAULT_OPTIONS: ChatModelOption[] = CHAT_MODEL_OPTIONS.map((m) => ({ ...m }));
const DEFAULT_IDS = DEFAULT_OPTIONS.map((m) => m.id);
const DEFAULT_SLUG_TO_ID = new Map(DEFAULT_OPTIONS.map((m) => [m.slug, m.id]));

async function admin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

function normalizeModelId(id: string): string {
  return DEFAULT_SLUG_TO_ID.get(id) ?? id;
}

function uniqueOptions(rows: BaseModelRow[]): ChatModelOption[] {
  const seen = new Set(DEFAULT_OPTIONS.flatMap((m) => [m.id, m.slug]));
  const options = [...DEFAULT_OPTIONS];
  for (const row of rows) {
    const slug = row.slug.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    options.push({
      id: slug,
      slug,
      label: row.name?.trim() || slug,
      provider: row.provider?.trim() || "openrouter",
      description: row.description ?? undefined,
      source: "library",
    });
  }
  return options;
}

async function getVisibleModelState(userId: string) {
  const db = await admin();
  const [{ data: settings }, { data: rows, error }] = await Promise.all([
    db
      .from("user_settings")
      .select("chat_model_allowlist,updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("base_models")
      .select("id,slug,name,provider,description,owner_id,is_public,created_at")
      .or(`owner_id.eq.${userId},is_public.eq.true`),
  ]);
  if (error) throw new Error(error.message);

  const visibleRows = ((rows ?? []) as BaseModelRow[]).filter(
    (row) => row.owner_id === userId || row.is_public === true,
  );
  const options = uniqueOptions(visibleRows);
  const availableIds = new Set(options.map((m) => m.id));
  const stored = ((settings as StoredSettings | null)?.chat_model_allowlist ?? null)?.map(normalizeModelId) ?? null;
  const settingsUpdatedAt = (settings as StoredSettings | null)?.updated_at
    ? new Date((settings as StoredSettings).updated_at as string).getTime()
    : 0;
  const newlyCreatedOwnedIds = visibleRows
    .filter((row) => row.owner_id === userId)
    .filter((row) => !settingsUpdatedAt || (row.created_at ? new Date(row.created_at).getTime() > settingsUpdatedAt : true))
    .map((row) => row.slug)
    .filter((slug) => availableIds.has(slug));

  const allowed = stored && stored.length
    ? Array.from(new Set([...stored.filter((id) => availableIds.has(id)), ...newlyCreatedOwnedIds]))
    : Array.from(availableIds);

  return { options, allowed, stored };
}

export const getMyModelAllowlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { options, allowed, stored } = await getVisibleModelState(userId);
    return { allowed, options, isDefault: !stored || stored.length === 0 };
  });

const Input = z.object({
  allowed: z.array(z.string()).min(1, "Pick at least one model"),
});

export const updateMyModelAllowlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const db = await admin();
    const { options } = await getVisibleModelState(userId);
    const availableIds = new Set(options.map((m) => m.id));
    const cleaned = Array.from(
      new Set(data.allowed.map(normalizeModelId).filter((id) => availableIds.has(id))),
    );
    if (cleaned.length === 0) throw new Error("Pick at least one valid model");
    const { error } = await db
      .from("user_settings")
      .upsert(
        { user_id: userId, chat_model_allowlist: cleaned, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, allowed: cleaned };
  });

/** Server-side enforcement: rejects models the user disabled in Settings → Models. */
export async function assertModelAllowedForUser(opts: {
  userId: string;
  modelId?: string | null;
}) {
  if (!opts.modelId) return;
  const modelId = normalizeModelId(opts.modelId);
  const { options, allowed } = await getVisibleModelState(opts.userId);
  const option = options.find((m) => m.id === modelId || m.slug === opts.modelId);
  if (!option) {
    throw new Error("That model is not in your model library. Add it in Agents & Models first.");
  }
  if (!allowed.includes(option.id)) {
    const label =
      options.find((m) => m.id === modelId)?.label ??
      opts.modelId;
    throw new Error(
      `${label} is disabled for your account. Enable it in Settings → Models.`,
    );
  }
}


