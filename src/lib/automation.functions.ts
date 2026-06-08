import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ── Reminders (tasks where kind='reminder') ─────────────────────────────
export const listReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("tasks")
      .select("id, title, body, status, created_at, agent_id, agents(slug, role)")
      .eq("kind", "reminder")
      .in("status", ["todo", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const completeReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("kind", "reminder");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Auto-approve rules (owner only) ─────────────────────────────────────
const RULE_KINDS = ["outbound_email", "outbound_linkedin", "outbound_reminder"] as const;

export const listAutoApproveRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { data, error } = await supabaseAdmin
      .from("auto_approve_rules")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const createAutoApproveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        kind: z.enum(RULE_KINDS),
        agent_slug: z.string().min(1).max(100).nullable().optional(),
        match: z.record(z.string(), z.any()).default({}),
        enabled: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { error } = await supabaseAdmin.from("auto_approve_rules").insert({
      owner_id: userId,
      kind: data.kind,
      agent_slug: data.agent_slug ?? null,
      match: data.match,
      enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleAutoApproveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { error } = await supabaseAdmin
      .from("auto_approve_rules")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutoApproveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { error } = await supabaseAdmin
      .from("auto_approve_rules")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
