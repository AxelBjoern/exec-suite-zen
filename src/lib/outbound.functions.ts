import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { GATEWAY_BASE_URL } from "@/lib/connections.functions";
import { chatCompletion } from "@/server/llm.server";

// ── Workspace connector (owner-only fallback for cron digest) ────────────
const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

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

// ── Per-user send helpers ────────────────────────────────────────────────
async function getUserConnection(userId: string, provider: "gmail" | "linkedin") {
  const { data } = await supabaseAdmin
    .from("user_connections")
    .select("connection_id, provider_email")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return data;
}

async function sendGmailAsUser(userId: string, to: string, subject: string, body: string) {
  const conn = await getUserConnection(userId, "gmail");
  if (!conn) throw new Error("Connect your Gmail in Settings first.");
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionId: conn.connection_id,
    connectorId: "google_mail",
    path: "/gmail/v1/users/me/messages/send",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: buildRawEmail(to, subject, body) }),
    },
  });
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function postLinkedInAsUser(
  userId: string,
  text: string,
  imageBase64?: string | null,
) {
  const conn = await getUserConnection(userId, "linkedin");
  if (!conn) throw new Error("Connect your LinkedIn in Settings first.");
  const connId = conn.connection_id;

  // Resolve author URN
  const me = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionId: connId,
    connectorId: "linkedin",
    path: "/v2/userinfo",
  });
  if (!me.ok) throw new Error(`LinkedIn userinfo failed (${me.status}): ${await me.text()}`);
  const { sub } = (await me.json()) as { sub?: string };
  if (!sub) throw new Error("LinkedIn userinfo missing sub");
  const author = `urn:li:person:${sub}`;

  let mediaAsset: string | null = null;
  if (imageBase64) {
    // 1. Register upload
    const regRes = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionId: connId,
      connectorId: "linkedin",
      path: "/v2/assets?action=registerUpload",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: author,
            serviceRelationships: [
              { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
            ],
          },
        }),
      },
    });
    if (!regRes.ok) throw new Error(`LinkedIn registerUpload failed (${regRes.status}): ${await regRes.text()}`);
    const reg = (await regRes.json()) as any;
    const uploadUrl: string | undefined =
      reg?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    mediaAsset = reg?.value?.asset ?? null;
    if (!uploadUrl || !mediaAsset) throw new Error("LinkedIn registerUpload missing upload URL/asset");

    // 2. PUT image bytes
    const bytes = Buffer.from(imageBase64, "base64");
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: bytes,
    });
    if (!upload.ok) throw new Error(`LinkedIn image upload failed (${upload.status}): ${await upload.text()}`);
  }

  // 3. ugcPosts
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

  const postRes = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionId: connId,
    connectorId: "linkedin",
    path: "/v2/ugcPosts",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify(body),
    },
  });
  if (!postRes.ok) throw new Error(`LinkedIn post failed (${postRes.status}): ${await postRes.text()}`);
  return postRes.json();
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

async function performSend(
  userId: string,
  kind: "outbound_email" | "outbound_reminder" | "outbound_linkedin",
  payload: Record<string, any>,
) {
  if (kind === "outbound_email" || kind === "outbound_reminder") {
    // Hybrid: prefer the user's own Gmail if connected; otherwise fall back
    // to the workspace Gmail connector (owner-only credentials).
    const conn = await getUserConnection(userId, "gmail");
    if (conn) {
      await sendGmailAsUser(userId, payload.to, payload.subject, payload.body);
    } else {
      await sendOwnerDigestEmail(payload.to, payload.subject, payload.body);
    }
  } else if (kind === "outbound_linkedin") {
    // LinkedIn currently requires per-user OAuth (no workspace fallback).
    await postLinkedInAsUser(userId, payload.text, payload.imageBase64 ?? null);
  }
}

// ── Request flow ─────────────────────────────────────────────────────────
const EmailReq = z.object({
  to: z.string().email().max(320),
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(20000),
});
const ReminderReq = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(20000),
});
const LinkedInReq = z.object({
  text: z.string().min(1).max(3000),
  imageBase64: z.string().max(8_000_000).optional().nullable(),
});

async function fileRequest(
  userId: string,
  userEmail: string | undefined,
  kind: "outbound_email" | "outbound_reminder" | "outbound_linkedin",
  payload: Record<string, any>,
) {
  const auto = await getAutoSend(userId);
  const canAutoSend =
    (kind === "outbound_linkedin" && auto.linkedin) ||
    ((kind === "outbound_email" || kind === "outbound_reminder") && auto.email);

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
      return { ok: true };
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
      throw new Error(msg);
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
    if (row.status !== "pending") throw new Error(`Already ${row.status}`);
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
      return { ok: true };
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
      throw new Error(msg);
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
      model: "deepseek/deepseek-v4-flash",
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
