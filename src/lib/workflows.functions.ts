import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["trigger", "llm_step", "human_review", "action", "output"]),
  label: z.string().min(1).max(160),
  config: z.record(z.string().min(1).max(64), z.any()).default({}),
});
export type WorkflowNode = z.infer<typeof NodeSchema>;

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workflows").select("*").order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const getWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workflows").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(160),
    description: z.string().max(2000).optional().nullable(),
    nodes: z.array(NodeSchema).max(40),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("workflows")
        .update({ name: data.name, description: data.description ?? null, nodes: data.nodes })
        .eq("id", data.id).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("workflows")
      .insert({ user_id: context.userId, name: data.name, description: data.description ?? null, nodes: data.nodes })
      .select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workflows").delete().eq("id", data.id).select();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleWorkflowActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    active: z.boolean(),
    cron: z.string().min(5).max(64).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wf, error: wfErr } = await context.supabase
      .from("workflows").select("*").eq("id", data.id).single();
    if (wfErr) throw new Error(wfErr.message);

    if (data.active) {
      const cron = data.cron ?? "0 9 * * *";
      let scheduleId = wf.schedule_id;
      const args = JSON.stringify({ workflow_id: wf.id, user_id: wf.user_id });
      if (scheduleId) {
        const { error } = await context.supabase.from("schedules")
          .update({ active: true, cron, args, agent_slug: "workflow-runner" })
          .eq("id", scheduleId).select();
        if (error) throw new Error(error.message);
      } else {
        const { data: sched, error } = await context.supabase.from("schedules")
          .insert({ name: `wf:${wf.name}`, cron, agent_slug: "workflow-runner", mode: "solo", verb: "run", args, active: true })
          .select().single();
        if (error) throw new Error(error.message);
        scheduleId = sched.id;
      }
      const { error: upErr } = await context.supabase.from("workflows")
        .update({ active: true, schedule_id: scheduleId }).eq("id", wf.id).select();
      if (upErr) throw new Error(upErr.message);
    } else {
      if (wf.schedule_id) {
        await context.supabase.from("schedules").update({ active: false }).eq("id", wf.schedule_id).select();
      }
      const { error } = await context.supabase.from("workflows").update({ active: false }).eq("id", wf.id).select();
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const runWorkflowNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wf, error: wfErr } = await context.supabase
      .from("workflows").select("id, user_id, nodes").eq("id", data.id).single();
    if (wfErr) throw new Error(wfErr.message);

    const { data: run, error: runErr } = await context.supabase
      .from("workflow_runs")
      .insert({ workflow_id: wf.id, user_id: context.userId, status: "pending" })
      .select().single();
    if (runErr) throw new Error(runErr.message);

    const { error: jobErr } = await context.supabase.from("job_queue").insert({
      kind: "workflow_step",
      payload: { run_id: run.id, node_index: 0 },
    }).select();
    if (jobErr) throw new Error(jobErr.message);

    return { run_id: run.id };
  });

export const listRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    workflow_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("workflow_runs").select("*").order("started_at", { ascending: false }).limit(data.limit);
    if (data.workflow_id) q = q.eq("workflow_id", data.workflow_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const decideRunApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    run_id: z.string().uuid(),
    approve: z.boolean(),
    notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("workflow_runs").select("*, approvals(*)").eq("id", data.run_id).single();
    if (error) throw new Error(error.message);
    if (run.status !== "awaiting_approval" || !run.approval_id) {
      throw new Error("Run is not awaiting approval");
    }
    await context.supabase.from("approvals").update({
      status: data.approve ? "approved" : "rejected",
      reviewer: context.userId,
      decided_at: new Date().toISOString(),
      notes: data.notes ?? null,
    }).eq("id", run.approval_id).select();

    if (!data.approve) {
      await context.supabase.from("workflow_runs").update({
        status: "cancelled", finished_at: new Date().toISOString(),
      }).eq("id", run.id).select();
      return { ok: true, status: "cancelled" };
    }

    // Resume: advance past the current human_review node.
    const log = Array.isArray(run.log) ? run.log : [];
    const lastIdx = log.findLastIndex?.((e: any) => e?.node_id === run.current_node_id);
    const nextIndex = (lastIdx >= 0 ? lastIdx : log.length - 1) + 1;
    await context.supabase.from("workflow_runs").update({ status: "running" }).eq("id", run.id).select();
    await context.supabase.from("job_queue").insert({
      kind: "workflow_step",
      payload: { run_id: run.id, node_index: nextIndex },
    }).select();
    return { ok: true, status: "running" };
  });
