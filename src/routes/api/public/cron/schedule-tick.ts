// Schedule tick: scans active schedules attached to workflows, fires those
// that are due (by cron expression), creates a workflow_runs row, and
// enqueues node_index 0 into job_queue. job-tick.ts picks it up.
//
// Idempotency: only fire when `now() >= next_run_at` (or `next_run_at` is
// null). After firing, recompute `next_run_at` from the cron and stamp
// `last_run_at`, so a second tick in the same minute is a no-op.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkCronAuth } from "@/server/cron-auth.server";
import { Cron } from "croner";

export const Route = createFileRoute("/api/public/cron/schedule-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkCronAuth(request);
        if (auth) return auth;

        const now = new Date();
        // Pull all active schedules attached to a workflow.
        const { data: workflows } = await supabaseAdmin
          .from("workflows")
          .select("id, user_id, schedule_id, active")
          .eq("active", true)
          .not("schedule_id", "is", null);

        const fired: { workflow_id: string; run_id: string; cron: string }[] = [];
        for (const wf of workflows ?? []) {
          const { data: sched } = await supabaseAdmin
            .from("schedules").select("*").eq("id", wf.schedule_id).maybeSingle();
          if (!sched?.active || !sched?.cron) continue;
          const nextRunAt = sched.next_run_at ? new Date(sched.next_run_at) : null;
          let due = !nextRunAt || nextRunAt <= now;

          let parsed: Cron;
          try {
            parsed = new Cron(sched.cron, { timezone: "UTC" });
          } catch {
            continue; // bad cron, skip
          }

          // Bootstrap: if next_run_at was never set, compute it and skip
          // this tick (don't fire on first sighting).
          if (!nextRunAt) {
            const next = parsed.nextRun(now);
            await supabaseAdmin.from("schedules").update({
              next_run_at: next ? next.toISOString() : undefined,
            }).eq("id", sched.id);
            continue;
          }

          if (!due) continue;

          // Create the run + enqueue first step.
          const { data: run, error: runErr } = await supabaseAdmin
            .from("workflow_runs")
            .insert({ workflow_id: wf.id, user_id: wf.user_id, status: "pending" })
            .select().single();
          if (runErr || !run) continue;
          await supabaseAdmin.from("job_queue").insert({
            kind: "workflow_step",
            payload: { run_id: run.id, node_index: 0 },
          });
          const next = parsed.nextRun(now);
          await supabaseAdmin.from("schedules").update({
            last_run_at: now.toISOString(),
            next_run_at: next ? next.toISOString() : undefined,
          }).eq("id", sched.id);
          fired.push({ workflow_id: wf.id, run_id: run.id, cron: sched.cron });
        }

        return Response.json({ ok: true, fired: fired.length, runs: fired });
      },
    },
  },
});
