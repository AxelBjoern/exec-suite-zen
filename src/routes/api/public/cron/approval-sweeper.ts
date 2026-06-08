// Cron: rules-based approval sweeper. No LLM. Runs every 15 min.
// Auto-approves pending approvals that match a user's auto_approve_rules.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkCronAuth } from "@/server/cron-auth.server";
import { shouldAutoApprove } from "@/server/auto-approve.server";

export const Route = createFileRoute("/api/public/cron/approval-sweeper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkCronAuth(request);
        if (auth) return auth;

        const { data: pending } = await supabaseAdmin
          .from("approvals")
          .select("*")
          .eq("status", "pending")
          .in("kind", ["reminder", "content_draft", "lead_reply"])
          .order("created_at", { ascending: true })
          .limit(50);

        const { data: rules } = await supabaseAdmin.from("auto_approve_rules").select("*");

        const results: any[] = [];
        for (const appr of pending ?? []) {
          let body = "";
          if (appr.ref_table === "content_drafts" && appr.ref_id) {
            const { data } = await supabaseAdmin.from("content_drafts").select("body_md").eq("id", appr.ref_id).maybeSingle();
            body = data?.body_md ?? "";
          } else if (appr.ref_table === "lead_replies" && appr.ref_id) {
            const { data } = await supabaseAdmin.from("lead_replies").select("draft_response").eq("id", appr.ref_id).maybeSingle();
            body = data?.draft_response ?? "";
          } else if (appr.ref_table === "tasks" && appr.ref_id) {
            const { data } = await supabaseAdmin.from("tasks").select("title, body").eq("id", appr.ref_id).maybeSingle();
            body = `${data?.title ?? ""}\n\n${data?.body ?? ""}`;
          }

          const decision = shouldAutoApprove(appr, rules ?? [], body);
          if (decision.approve) {
            await supabaseAdmin.from("approvals").update({
              status: "approved",
              reviewer: "auto-sweeper",
              decided_at: new Date().toISOString(),
              notes: decision.reason,
            }).eq("id", appr.id);
            await supabaseAdmin.from("audit_log").insert({
              kind: "auto_approval",
              payload: { approval_id: appr.id, reason: decision.reason, ref_table: appr.ref_table, ref_id: appr.ref_id } as any,
            } as any).then(() => {}, () => {});
            results.push({ id: appr.id, approved: true, reason: decision.reason });
          } else {
            results.push({ id: appr.id, approved: false, reason: decision.reason });
          }
        }
        return Response.json({ ok: true, scanned: results.length, results });
      },
    },
  },
});
