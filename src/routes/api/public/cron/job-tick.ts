import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runTask } from "@/server/cadence.server";
import { runWorkflowStep } from "@/server/workflow-runner.server";
import { checkCronAuth } from "@/server/cron-auth.server";

const BATCH = 5;

export const Route = createFileRoute("/api/public/cron/job-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkCronAuth(request);
        if (auth) return auth;

        // Claim up to BATCH due jobs (no SKIP LOCKED via PostgREST; rely on
        // status update as a soft lock — fine for 1/min cadence).
        const { data: due } = await supabaseAdmin
          .from("job_queue").select("*")
          .eq("status", "pending")
          .lte("run_at", new Date().toISOString())
          .order("run_at").limit(BATCH);

        const results: any[] = [];
        for (const job of due ?? []) {
          const { data: claimed } = await supabaseAdmin
            .from("job_queue").update({ status: "running", updated_at: new Date().toISOString() })
            .eq("id", job.id).eq("status", "pending").select().maybeSingle();
          if (!claimed) continue;
          try {
            if (job.kind === "run_task") {
              const taskId = (job.payload as any)?.task_id;
              if (!taskId) throw new Error("missing task_id");
              await runTask(taskId);
            } else if (job.kind === "workflow_step") {
              const p = job.payload as any;
              if (!p?.run_id || typeof p?.node_index !== "number") throw new Error("missing run_id/node_index");
              await runWorkflowStep({ run_id: p.run_id, node_index: p.node_index });
            } else {
              throw new Error(`unknown job kind: ${job.kind}`);
            }
            await supabaseAdmin.from("job_queue").update({
              status: "done", updated_at: new Date().toISOString(),
            }).eq("id", job.id);
            results.push({ id: job.id, ok: true });
          } catch (e: any) {
            const attempts = (job.attempts ?? 0) + 1;
            const failed = attempts >= 3;
            await supabaseAdmin.from("job_queue").update({
              status: failed ? "failed" : "pending",
              attempts, last_error: e.message,
              run_at: failed ? job.run_at : new Date(Date.now() + 60_000 * attempts).toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", job.id);
            results.push({ id: job.id, ok: false, error: e.message });
          }
        }
        return Response.json({ ok: true, claimed: results.length, results });
      },
    },
  },
});
