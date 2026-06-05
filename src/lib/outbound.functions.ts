import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const LINKEDIN_GATEWAY = "https://connector-gateway.lovable.dev/linkedin";

function gwHeaders(connectorKey: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");
  if (!connectorKey) throw new Error("Connector API key missing");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectorKey,
    "Content-Type": "application/json",
  };
}

function base64url(input: string) {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawEmail(to: string, subject: string, body: string) {
  const msg = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");
  return base64url(msg);
}

async function sendGmailRaw(to: string, subject: string, body: string) {
  const key = process.env.GOOGLE_MAIL_API_KEY!;
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: gwHeaders(key),
    body: JSON.stringify({ raw: buildRawEmail(to, subject, body) }),
  });
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function postLinkedInRaw(text: string) {
  const key = process.env.LINKEDIN_API_KEY!;
  const headers = gwHeaders(key);
  const meRes = await fetch(`${LINKEDIN_GATEWAY}/v2/userinfo`, { headers });
  if (!meRes.ok) throw new Error(`LinkedIn userinfo failed (${meRes.status}): ${await meRes.text()}`);
  const me = (await meRes.json()) as { sub?: string };
  if (!me.sub) throw new Error("LinkedIn userinfo missing sub");
  const body = {
    author: `urn:li:person:${me.sub}`,
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
    headers: { ...headers, "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
  });
  if (!postRes.ok) throw new Error(`LinkedIn post failed (${postRes.status}): ${await postRes.text()}`);
  return postRes.json();
}

// ─── Owner bootstrap ────────────────────────────────────────────────
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

// ─── Request submission (queues, never sends) ───────────────────────
const EmailReq = z.object({
  to: z.string().email().max(320),
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(20000),
});
const ReminderReq = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(20000),
});
const LinkedInReq = z.object({ text: z.string().min(1).max(3000) });

export const requestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => EmailReq.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .insert({
        kind: "outbound_email",
        status: "pending",
        requester_id: userId,
        payload: data,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const requestReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ReminderReq.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const owner = process.env.OWNER_EMAIL;
    if (!owner) throw new Error("OWNER_EMAIL not configured");
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .insert({
        kind: "outbound_reminder",
        status: "pending",
        requester_id: userId,
        payload: { to: owner, subject: `[Reminder] ${data.subject}`, body: data.body },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const requestLinkedIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => LinkedInReq.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .insert({
        kind: "outbound_linkedin",
        status: "pending",
        requester_id: userId,
        payload: data,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// ─── My requests (list) ─────────────────────────────────────────────
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
    return { rows: data ?? [] };
  });

// ─── Owner: list pending + approve / reject ─────────────────────────
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

const DecisionInput = z.object({
  id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

export const approveOutbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DecisionInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    await assertOwner(userId);
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .select("id, kind, status, payload")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Request not found");
    if (row.status !== "pending") throw new Error(`Already ${row.status}`);

    try {
      const p = row.payload as Record<string, string>;
      if (row.kind === "outbound_email" || row.kind === "outbound_reminder") {
        await sendGmailRaw(p.to, p.subject, p.body);
      } else if (row.kind === "outbound_linkedin") {
        await postLinkedInRaw(p.text);
      } else {
        throw new Error(`Unknown kind: ${row.kind}`);
      }
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
