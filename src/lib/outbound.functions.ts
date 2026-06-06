import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion } from "@/server/llm.server";

// ── Workspace connectors (shared, Lovable Connectors) ────────────────────
const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const LINKEDIN_GATEWAY = "https://connector-gateway.lovable.dev/linkedin";

async function postLinkedInAsWorkspace(text: string, imageBase64?: string | null) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const liKey = process.env.LINKEDIN_API_KEY;
  if (!lovableKey || !liKey) throw new Error("Workspace LinkedIn connector not configured");
  const wsHeaders = {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": liKey,
  };

  const meRes = await fetch(`${LINKEDIN_GATEWAY}/v2/userinfo`, { headers: wsHeaders });
  if (!meRes.ok) throw new Error(`LinkedIn userinfo failed (${meRes.status}): ${await meRes.text()}`);
  const { sub } = (await meRes.json()) as { sub?: string };
  if (!sub) throw new Error("LinkedIn userinfo missing sub");
  const author = `urn:li:person:${sub}`;

  let mediaAsset: string | null = null;
  if (imageBase64) {
    const regRes = await fetch(`${LINKEDIN_GATEWAY}/v2/assets?action=registerUpload`, {
      method: "POST",
      headers: { ...wsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: author,
          serviceRelationships: [
            { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
          ],
        },
      }),
    });
    if (!regRes.ok) throw new Error(`LinkedIn registerUpload failed (${regRes.status}): ${await regRes.text()}`);
    const reg = (await regRes.json()) as any;
    const uploadUrl: string | undefined =
      reg?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    mediaAsset = reg?.value?.asset ?? null;
    if (!uploadUrl || !mediaAsset) throw new Error("LinkedIn registerUpload missing upload URL/asset");
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: Buffer.from(imageBase64, "base64"),
    });
    if (!upload.ok) throw new Error(`LinkedIn image upload failed (${upload.status}): ${await upload.text()}`);
  }

  const body = mediaAsset
    ? {
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "IMAGE",
            media: [{ status: "READY", media: mediaAsset }],
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }
    : {
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      };

  const postRes = await fetch(`${LINKEDIN_GATEWAY}/v2/ugcPosts`, {
    method: "POST",
    headers: { ...wsHeaders, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
  });
  if (!postRes.ok) throw new Error(`LinkedIn post failed (${postRes.status}): ${await postRes.text()}`);
  return postRes.json();
}

function base64url(input: string | Buffer) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(to: string, subject: string, body: string) {
  return base64url(
    [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "MIME-Version: 1.0",
      "",
      body,
    ].join("\r\n"),
  );
}

// ── Workspace senders (shared connectors only) ───────────────────────────
async function sendGmailWorkspace(to: string, subject: string, body: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) {
    throw new Error("Workspace Gmail connector not connected. Connect Gmail in Lovable Connectors.");
  }
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: buildRawEmail(to, subject, body) }),
  });
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function performSend(
  _userId: string,
  kind: "outbound_email" | "outbound_reminder" | "outbound_linkedin",
  payload: Record<string, any>,
) {
  if (kind === "outbound_email" || kind === "outbound_reminder") {
    await sendGmailWorkspace(payload.to, payload.subject, payload.body);
  } else if (kind === "outbound_linkedin") {
    await postLinkedInAsWorkspace(payload.text, payload.imageBase64 ?? null);
  }
}

// ── Owner role bootstrap ─────────────────────────────────────────────────
export const ensureOwnerRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    const owner = process.env.OWNER_EMAIL?.toLowerCase();
    if (!owner) return { isOwner: false };
    const email = (claims?.email ?? "").toLowerCase();
    if (email !== owner) {
      const { data } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", userId)
        .eq("role", "owner")
        .maybeSingle();
      return { isOwner: !!data };
    }
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "owner" }, { onConflict: "user_id,role" });
    return { isOwner: true };
  });

// ── Settings lookup helper ───────────────────────────────────────────────
async function getAutoSend(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_settings")
    .select("auto_send_email, auto_send_linkedin")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    email: data?.auto_send_email ?? false,
    linkedin: data?.auto_send_linkedin ?? false,
  };
}


// Optional ISO timestamp ("YYYY-MM-DDTHH:mm" from <input type=datetime-local> OK)
const ScheduledAt = z.string().min(10).max(40).optional().nullable();

const EmailReq = z.object({
  to: z.string().email().max(320),
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(20000),
  scheduled_at: ScheduledAt,
});
const ReminderReq = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(20000),
  scheduled_at: ScheduledAt,
});
const LinkedInReq = z.object({
  text: z.string().min(1).max(3000),
  imageBase64: z.string().max(8_000_000).optional().nullable(),
  scheduled_at: ScheduledAt,
});

function isFutureSchedule(s?: string | null) {
  if (!s) return false;
  const t = Date.parse(s);
  return Number.isFinite(t) && t > Date.now() + 30_000; // >30s in future
}

async function fileRequest(
  userId: string,
  userEmail: string | undefined,
  kind: "outbound_email" | "outbound_reminder" | "outbound_linkedin",
  payload: Record<string, any>,
) {
  const auto = await getAutoSend(userId);
  const scheduled = isFutureSchedule(payload?.scheduled_at);
  const canAutoSend =
    !scheduled && (
      (kind === "outbound_linkedin" && auto.linkedin) ||
      ((kind === "outbound_email" || kind === "outbound_reminder") && auto.email)
    );

  if (canAutoSend) {
    try {
      await performSend(userId, kind, payload);
      const { data: row } = await supabaseAdmin
        .from("approvals")
        .insert({
          kind,
          status: "sent",
          requester_id: userId,
          payload,
          reviewer: userEmail ?? userId,
          decided_at: new Date().toISOString(),
          notes: "auto-sent (user self-approved)",
        })
        .select("id")
        .single();
      return { id: row?.id, status: "sent" as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      const { data: row } = await supabaseAdmin
        .from("approvals")
        .insert({
          kind,
          status: "failed",
          requester_id: userId,
          payload,
          reviewer: userEmail ?? userId,
          decided_at: new Date().toISOString(),
          notes: msg,
        })
        .select("id")
        .single();
      throw new Error(msg + ` (logged as ${row?.id})`);
    }
  }

  const { data: row, error } = await supabaseAdmin
    .from("approvals")
    .insert({ kind, status: "pending", requester_id: userId, payload })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id, status: "pending" as const };
}

export const requestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => EmailReq.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    return fileRequest(userId, claims?.email, "outbound_email", data);
  });

export const requestReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ReminderReq.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    const owner = process.env.OWNER_EMAIL;
    if (!owner) throw new Error("OWNER_EMAIL not configured");
    return fileRequest(userId, claims?.email, "outbound_reminder", {
      to: owner,
      subject: `[Reminder] ${data.subject}`,
      body: data.body,
    });
  });

// Internal helper for the chat handler. Files an outbound row (pending or
// auto-sent) on behalf of the authenticated user. Returns { id, status }.
export async function fileOutboundFromChat(opts: {
  userId: string;
  userEmail?: string;
  kind: "outbound_email" | "outbound_reminder" | "outbound_linkedin";
  payload: Record<string, any>;
}) {
  if (opts.kind === "outbound_reminder") {
    const owner = process.env.OWNER_EMAIL;
    if (!owner) throw new Error("OWNER_EMAIL not configured");
    const p = {
      to: owner,
      subject: `[Reminder] ${opts.payload.subject ?? "Reminder"}`,
      body: opts.payload.body ?? "",
    };
    return fileRequest(opts.userId, opts.userEmail, "outbound_reminder", p);
  }
  return fileRequest(opts.userId, opts.userEmail, opts.kind, opts.payload);
}

export const requestLinkedIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => LinkedInReq.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    return fileRequest(userId, claims?.email, "outbound_linkedin", data);
  });

// ── My requests list ─────────────────────────────────────────────────────
export const listMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { data, error } = await supabaseAdmin
      .from("approvals")
      .select("id, kind, status, payload, notes, decided_at, created_at")
      .eq("requester_id", userId)
      .in("kind", ["outbound_email", "outbound_linkedin", "outbound_reminder"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    // strip heavy imageBase64 from list payloads
    const rows = (data ?? []).map((r: any) => {
      const p = { ...(r.payload ?? {}) };
      if (p.imageBase64) p.imageBase64 = "[image]";
      return { ...r, payload: p };
    });
    return { rows };
  });

// ── Delete: requester deletes their own pending draft ────────────────────
const DeleteInput = z.object({ id: z.string().uuid() });
export const deleteOutbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DeleteInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .select("id, status, requester_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Request not found");
    if (row.requester_id !== userId) throw new Error("Forbidden");
    if (row.status !== "pending") throw new Error(`Cannot delete a ${row.status} request`);
    const { error: delErr } = await supabaseAdmin.from("approvals").delete().eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });

// ── Owner queue ──────────────────────────────────────────────────────────
async function assertOwner(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: owner only");
}

export const listPendingApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertOwner(userId);
    const { data, error } = await supabaseAdmin
      .from("approvals")
      .select("id, kind, status, payload, requester_id, created_at, decided_at, notes")
      .in("kind", ["outbound_email", "outbound_linkedin", "outbound_reminder"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const DecisionInput = z.object({ id: z.string().uuid(), notes: z.string().max(2000).optional() });

// Allow a requester to edit their own pending request's payload
const UpdateDraftInput = z.object({
  id: z.string().uuid(),
  payload: z.record(z.string(), z.any()),
});

export const updateOutboundDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateDraftInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .select("id, status, requester_id, payload")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Request not found");
    if (row.requester_id !== userId) throw new Error("Forbidden");
    if (row.status !== "pending") throw new Error(`Cannot edit a ${row.status} request`);
    // Preserve imageBase64 (the list strips it) unless explicitly overwritten
    const prev = (row.payload ?? {}) as Record<string, any>;
    const merged: Record<string, any> = { ...prev, ...data.payload };
    if (data.payload.imageBase64 === undefined && prev.imageBase64) {
      merged.imageBase64 = prev.imageBase64;
    }
    const { error: upErr } = await supabaseAdmin
      .from("approvals")
      .update({ payload: merged })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const approveOutbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DecisionInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    await assertOwner(userId);
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .select("id, kind, status, payload, requester_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Request not found");
    if (row.status !== "pending") throw new Error(`Already ${row.status}`);
    if (!row.requester_id) throw new Error("Request has no requester");

    try {
      await performSend(row.requester_id, row.kind as any, (row.payload ?? {}) as any);
      await supabaseAdmin
        .from("approvals")
        .update({
          status: "sent",
          decided_at: new Date().toISOString(),
          reviewer: claims?.email ?? userId,
          notes: data.notes ?? null,
        })
        .eq("id", data.id);
      return { ok: true, status: "sent" as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      await supabaseAdmin
        .from("approvals")
        .update({
          status: "failed",
          decided_at: new Date().toISOString(),
          reviewer: claims?.email ?? userId,
          notes: msg,
        })
        .eq("id", data.id);
      return { ok: false, status: "failed" as const, error: msg };
    }
  });

export const rejectOutbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DecisionInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    await assertOwner(userId);
    const { error } = await supabaseAdmin
      .from("approvals")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        reviewer: claims?.email ?? userId,
        notes: data.notes ?? null,
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Self-send: requester sends their own pending draft ───────────────────
const SelfSendInput = z.object({ id: z.string().uuid() });
export const sendOwnOutbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SelfSendInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .select("id, kind, status, payload, requester_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Request not found");
    if (row.requester_id !== userId) throw new Error("Forbidden");
    if (row.status === "sent") return { ok: true, status: "sent" as const };
    if (row.status !== "pending" && row.status !== "failed") throw new Error(`Already ${row.status}`);
    try {
      await performSend(userId, row.kind as any, (row.payload ?? {}) as any);
      await supabaseAdmin
        .from("approvals")
        .update({
          status: "sent",
          decided_at: new Date().toISOString(),
          reviewer: claims?.email ?? userId,
          notes: "self-sent by requester",
        })
        .eq("id", data.id);
      return { ok: true, status: "sent" as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      await supabaseAdmin
        .from("approvals")
        .update({
          status: "failed",
          decided_at: new Date().toISOString(),
          reviewer: claims?.email ?? userId,
          notes: msg,
        })
        .eq("id", data.id);
      return { ok: false, status: "failed" as const, error: msg };
    }
  });

// ── AI edit: rewrite a draft using a natural-language instruction ────────
const AiEditInput = z.object({
  kind: z.enum(["outbound_email", "outbound_reminder", "outbound_linkedin"]),
  instruction: z.string().min(1).max(2000),
  draft: z.object({
    to: z.string().max(320).optional(),
    subject: z.string().max(255).optional(),
    body: z.string().max(20000).optional(),
    text: z.string().max(3000).optional(),
  }),
});
export const aiEditDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => AiEditInput.parse(i))
  .handler(async ({ data }) => {
    const isLi = data.kind === "outbound_linkedin";
    const sys = isLi
      ? "You rewrite LinkedIn posts. Return ONLY JSON: {\"text\": \"...\"}. Keep under 3000 chars. No markdown fences."
      : "You rewrite emails. Return ONLY JSON: {\"subject\": \"...\", \"body\": \"...\"}. Preserve any reminder prefix in the subject. No markdown fences.";
    const userMsg = isLi
      ? `Current post:\n${data.draft.text ?? ""}\n\nInstruction:\n${data.instruction}`
      : `Current subject: ${data.draft.subject ?? ""}\n\nCurrent body:\n${data.draft.body ?? ""}\n\nInstruction:\n${data.instruction}`;
    const json = await chatCompletion({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userMsg },
      ],
      model: "x-ai/grok-4.3",
      temperature: 0.7,
      max_tokens: 2000,
    });
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: any = {};
    try { parsed = JSON.parse(stripped); } catch {
      // fall back: treat content as the body/text
      parsed = isLi ? { text: stripped } : { body: stripped };
    }
    if (isLi) return { text: String(parsed.text ?? data.draft.text ?? "") };
    return {
      subject: String(parsed.subject ?? data.draft.subject ?? ""),
      body: String(parsed.body ?? data.draft.body ?? ""),
    };
  });

// ── File a multi-item publishing plan from chat ──────────────────────────
const FilePlanInput = z.object({
  plan: z.string().min(20).max(40000),
});

export const filePlanFromChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => FilePlanInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    const userEmail = claims?.email;

    const sys =
      "You extract outbound publishing items from a plan. Return ONLY JSON, no markdown fences:\n" +
      '{"items":[{"kind":"linkedin"|"email"|"reminder","text"?:"...","to"?:"...","subject"?:"...","body"?:"...","scheduled_at"?:"YYYY-MM-DD HH:mm TZ","label"?:"short title"}]}.\n' +
      "For LinkedIn posts: include the FULL post text (hook + body + hashtags) in `text`. If the plan references copy without quoting it, use the strongest available reconstruction from hooks/themes in the plan.\n" +
      "For emails: require `to`, `subject`, `body`. For reminders: require `subject`, `body`.\n" +
      "If items are scheduled, put the human-readable date/time in `scheduled_at`. Order items chronologically. Skip metadata sections (metrics, risks, action items).";

    const json = await chatCompletion({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Plan:\n\n${data.plan}` },
      ],
      model: "deepseek/deepseek-v4-flash",
      temperature: 0.3,
      max_tokens: 8000,
    });
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: { items?: any[] } = {};
    try { parsed = JSON.parse(stripped); } catch { throw new Error("Could not parse plan into items"); }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    if (items.length === 0) throw new Error("No publishable items found in plan");

    const filed: Array<{ id?: string; status: string; label: string }> = [];
    const errors: string[] = [];
    for (const it of items) {
      try {
        let kind: "outbound_email" | "outbound_reminder" | "outbound_linkedin";
        let payload: Record<string, any>;
        let label: string = it.label ?? "";
        if (it.kind === "linkedin") {
          if (!it.text) { errors.push(`${label || "linkedin item"}: missing text`); continue; }
          kind = "outbound_linkedin";
          payload = { text: String(it.text) };
          if (it.scheduled_at) payload.scheduled_at = String(it.scheduled_at);
          label = label || "LinkedIn post";
        } else if (it.kind === "email") {
          if (!it.to || !it.body) { errors.push(`${label || "email item"}: missing to/body`); continue; }
          kind = "outbound_email";
          payload = {
            to: String(it.to),
            subject: String(it.subject ?? "Message"),
            body: String(it.body),
          };
          if (it.scheduled_at) payload.scheduled_at = String(it.scheduled_at);
          label = label || `Email to ${it.to}`;
        } else if (it.kind === "reminder") {
          if (!it.body) { errors.push(`${label || "reminder item"}: missing body`); continue; }
          kind = "outbound_reminder";
          payload = {
            subject: String(it.subject ?? "Reminder"),
            body: String(it.body),
          };
          if (it.scheduled_at) payload.scheduled_at = String(it.scheduled_at);
          label = label || "Reminder";
        } else {
          errors.push(`Unknown kind: ${it.kind}`);
          continue;
        }
        const res = await fileOutboundFromChat({ userId, userEmail, kind, payload });
        filed.push({ id: res.id, status: res.status, label });
      } catch (e: any) {
        errors.push(`${it.label ?? it.kind}: ${e?.message ?? "failed"}`);
      }
    }

    return { filed, errors, total: items.length };
  });


export async function sendOwnerDigestEmail(to: string, subject: string, body: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) throw new Error("Workspace Gmail connector not configured");
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: buildRawEmail(to, subject, body) }),
  });
  if (!res.ok) throw new Error(`digest gmail send failed: ${res.status} ${await res.text()}`);
  return res.json();
}
