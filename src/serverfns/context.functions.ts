import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CompanyContext = {
  id: string;
  mission: string;
  principles: string;
  icp: string;
  positioning: string;
  current_priorities: string;
  notes: string;
  updated_at: string;
};

export const getCompanyContext = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("company_context")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as CompanyContext | null;
  }
);

export const saveCompanyContext = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<CompanyContext>) => d)
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("company_context")
      .select("id")
      .limit(1)
      .maybeSingle();
    const patch = {
      mission: data.mission ?? "",
      principles: data.principles ?? "",
      icp: data.icp ?? "",
      positioning: data.positioning ?? "",
      current_priorities: data.current_priorities ?? "",
      notes: data.notes ?? "",
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      const { data: row, error } = await supabaseAdmin
        .from("company_context")
        .update(patch)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabaseAdmin
      .from("company_context")
      .insert(patch)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const recallDecisions = createServerFn({ method: "GET" })
  .inputValidator((d: { limit?: number; agent_slug?: string }) => d)
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("decision_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (data.agent_slug) q = q.eq("agent_slug", data.agent_slug);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const logDecision = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      thread_id?: string | null;
      agent_slug?: string | null;
      title: string;
      decision: string;
      rationale?: string;
      amendments?: any[];
    }) => d
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("decision_log")
      .insert({
        thread_id: data.thread_id ?? null,
        agent_slug: data.agent_slug ?? null,
        title: data.title,
        decision: data.decision,
        rationale: data.rationale ?? null,
        amendments: data.amendments ?? [],
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });
