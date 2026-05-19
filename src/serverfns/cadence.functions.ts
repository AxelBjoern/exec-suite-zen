import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { approveWeeklyPlan, runMondayBoard } from "@/server/cadence.server";

export const getWeeklyPlan = createServerFn({ method: "GET" }).handler(async () => {
  const { data: appr } = await supabaseAdmin
    .from("approvals").select("*, tasks(*)")
    .eq("kind", "weekly_plan")
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (!appr) return null;
  const childIds: string[] = (appr.payload as any)?.child_task_ids ?? [];
  const { data: children } = childIds.length
    ? await supabaseAdmin.from("tasks").select("*, agents(slug,name,role)").in("id", childIds)
    : { data: [] as any[] };
  return { approval: appr, children: children ?? [] };
});

export const approveWeeklyPlanFn = createServerFn({ method: "POST" })
  .inputValidator((d: { approval_id: string }) => d)
  .handler(async ({ data }) => approveWeeklyPlan(data.approval_id));

export const triggerMondayBoardFn = createServerFn({ method: "POST" }).handler(async () => {
  return runMondayBoard();
});

export const listSuggestions = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("suggestions").select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false }).limit(50);
  return data ?? [];
});

export const decideSuggestion = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; decision: "approved" | "dismissed" }) => d)
  .handler(async ({ data }) => {
    await supabaseAdmin.from("suggestions").update({
      status: data.decision, decided_at: new Date().toISOString(),
    }).eq("id", data.id);
    return { ok: true };
  });
