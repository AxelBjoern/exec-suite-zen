import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Email sending via Resend. Every send goes through /approvals first.
// queueEmail() — agents call this; it parks the email on a task with payload + approval row.
// sendQueuedEmail() — called by approvals UI on approve; performs the actual send.

type EmailDraft = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  agent_slug?: string;
  thread_id?: string | null;
  parent_task_id?: string | null;
};

export const queueEmail = createServerFn({ method: "POST" })
  .inputValidator((d: EmailDraft) => d)
  .handler(async ({ data }) => {
    if (!data.to || !data.subject) throw new Error("to and subject are required");
    const owner = data.agent_slug ?? "sales";
    const { data: agent } = await supabaseAdmin
      .from("agents").select("id").eq("slug", owner).maybeSingle();

    const { data: task } = await supabaseAdmin.from("tasks").insert({
      agent_id: agent?.id ?? null,
      thread_id: data.thread_id ?? null,
      parent_task_id: data.parent_task_id ?? null,
      owner_agent: owner,
      title: `Email → ${data.to}: ${data.subject}`.slice(0, 200),
      body: data.text ?? data.html ?? "",
      status: "blocked",
      requires_approval: true,
      payload: {
        kind: "email",
        to: data.to,
        from: data.from ?? null,
        subject: data.subject,
        html: data.html ?? null,
        text: data.text ?? null,
      },
    }).select().single();

    if (task) {
      await supabaseAdmin.from("approvals").insert({
        task_id: task.id, status: "pending",
      });
    }
    return { task_id: task?.id, queued: true };
  });

export const sendQueuedEmail = createServerFn({ method: "POST" })
  .inputValidator((d: { task_id: string }) => d)
  .handler(async ({ data }) => {
    const { data: task } = await supabaseAdmin
      .from("tasks").select("*").eq("id", data.task_id).single();
    if (!task) throw new Error("task not found");
    const payload = (task.payload ?? {}) as any;
    if (payload.kind !== "email") throw new Error("not an email task");

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      const err = "RESEND_API_KEY not configured. Add it in Lovable Cloud → Secrets.";
      await supabaseAdmin.from("tool_calls").insert({
        task_id: task.id, agent_slug: task.owner_agent, tool: "email.send",
        request: payload, status: "error", error: err,
      });
      throw new Error(err);
    }

    const from = payload.from ?? process.env.RESEND_FROM ?? "VDNX <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html ?? undefined,
        text: payload.text ?? undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.ok;
    await supabaseAdmin.from("tool_calls").insert({
      task_id: task.id, agent_slug: task.owner_agent, tool: "email.send",
      request: { ...payload, from },
      response: body,
      status: ok ? "ok" : "error",
      error: ok ? null : `Resend ${res.status}: ${JSON.stringify(body).slice(0, 300)}`,
    });
    if (!ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return { ok: true, id: (body as any).id };
  });
