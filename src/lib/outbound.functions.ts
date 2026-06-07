import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion } from "@/server/llm.server";

// ── Workspace connectors (shared, Lovable Connectors) ────────────────────
const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const LINKEDIN_GATEWAY = "https://connector-gateway.lovable.dev/linkedin";

// LinkedIn document carousels: max 10 pages
const PDF_MAX_PAGES = 10;

type LiMediaKind = "image" | "pdf" | "video";

function pickLiMedia(payload: Record<string, any>): {
  kind: LiMediaKind;
  base64: string;
  mime: string;
  filename: string;
} | null {
  const mk = payload.mediaKind as LiMediaKind | undefined;
  const mb = payload.mediaBase64 as string | undefined;
  if (mk && mb) {
    return {
      kind: mk,
      base64: mb,
      mime: payload.mediaMime ?? (mk === "pdf" ? "application/pdf" : mk === "video" ? "video/mp4" : "image/png"),
      filename: payload.mediaFilename ?? (mk === "pdf" ? "carousel.pdf" : mk === "video" ? "clip.mp4" : "image.png"),
    };
  }
  if (payload.imageBase64) {
    return { kind: "image", base64: payload.imageBase64, mime: "image/png", filename: "image.png" };
  }
  return null;
}


async function postLinkedInAsWorkspace(text: string, media: ReturnType<typeof pickLiMedia>) {
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

  // PDF carousels live on a different endpoint (LinkedIn versioned REST documents API).
  // The legacy /v2/assets registerUpload endpoint does NOT accept feedshare-document
  // and returns a 403 "Data Processing Exception" on the recipes field.
  if (media?.kind === "pdf") {
    try {
      const pdfDoc = await PDFDocument.load(Buffer.from(media.base64, "base64"));
      const pages = pdfDoc.getPageCount();
      if (pages > PDF_MAX_PAGES) {
        throw new Error(`PDF carousel exceeds ${PDF_MAX_PAGES}-page limit (${pages} pages).`);
      }
    } catch (e: any) {
      if (e?.message?.includes("PDF carousel")) throw e;
      throw new Error(`Invalid PDF: ${e?.message ?? "could not parse"}`);
    }

    const liVersion = { "LinkedIn-Version": "202511", "X-Restli-Protocol-Version": "2.0.0" };
    const initRes = await fetch(`${LINKEDIN_GATEWAY}/rest/documents?action=initializeUpload`, {
      method: "POST",
      headers: { ...wsHeaders, ...liVersion, "Content-Type": "application/json" },
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    });
    if (!initRes.ok) {
      const body = await initRes.text();
      if (body.includes("NONEXISTENT_VERSION")) {
        throw new Error(`LinkedIn document init failed (${initRes.status}): LinkedIn-Version header "${liVersion["LinkedIn-Version"]}" is no longer active. Bump it to a current YYYYMM in src/lib/outbound.functions.ts and src/routes/api/public/cron/scheduled-outbound.ts. Raw: ${body}`);
      }
      throw new Error(`LinkedIn document init failed (${initRes.status}): ${body}`);
    }
    const init = (await initRes.json()) as any;
    const uploadUrl: string | undefined = init?.value?.uploadUrl;
    const documentUrn: string | undefined = init?.value?.document;
    if (!uploadUrl || !documentUrn) throw new Error("LinkedIn document init missing upload URL/urn");

    const up = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.from(media.base64, "base64"),
    });
    if (!up.ok) throw new Error(`LinkedIn document upload failed (${up.status}): ${await up.text()}`);

    const postRes = await fetch(`${LINKEDIN_GATEWAY}/rest/posts`, {
      method: "POST",
      headers: { ...wsHeaders, ...liVersion, "Content-Type": "application/json" },
      body: JSON.stringify({
        author,
        commentary: text,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: { media: { id: documentUrn, title: media.filename.replace(/\.pdf$/i, "") } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (!postRes.ok) throw new Error(`LinkedIn document post failed (${postRes.status}): ${await postRes.text()}`);
    return { ok: true, kind: "pdf", documentUrn };
  }

  let mediaAsset: string | null = null;
  let shareMediaCategory: "NONE" | "IMAGE" | "VIDEO" = "NONE";

  if (media) {
    const recipeByKind: Record<"image" | "video", string> = {
      image: "urn:li:digitalmediaRecipe:feedshare-image",
      video: "urn:li:digitalmediaRecipe:feedshare-video",
    };
    const recipe = recipeByKind[media.kind as "image" | "video"];

    const regRes = await fetch(`${LINKEDIN_GATEWAY}/v2/assets?action=registerUpload`, {
      method: "POST",
      headers: { ...wsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: [recipe],
          owner: author,
          serviceRelationships: [
            { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
          ],
        },
      }),
    });
    if (!regRes.ok) throw new Error(`LinkedIn registerUpload failed (${regRes.status}, recipe=${recipe}): ${await regRes.text()}`);
    const reg = (await regRes.json()) as any;
    const uploadUrl: string | undefined =
      reg?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    mediaAsset = reg?.value?.asset ?? null;
    if (!uploadUrl || !mediaAsset) throw new Error("LinkedIn registerUpload missing upload URL/asset");
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": media.mime },
      body: Buffer.from(media.base64, "base64"),
    });
    if (!upload.ok) throw new Error(`LinkedIn ${media.kind} upload failed (${upload.status}): ${await upload.text()}`);

    // Video assets must reach AVAILABLE before posting. Poll up to ~60s.
    if (media.kind === "video") {
      const assetId = mediaAsset.split(":").pop();
      const deadline = Date.now() + 60_000;
      let available = false;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const stRes = await fetch(`${LINKEDIN_GATEWAY}/v2/assets/${assetId}`, { headers: wsHeaders });
        if (!stRes.ok) continue;
        const st = (await stRes.json()) as any;
        const status = st?.recipes?.[0]?.status ?? st?.status;
        if (status === "AVAILABLE") { available = true; break; }
        if (status === "PROCESSING_FAILED" || status === "CLIENT_ERROR" || status === "SERVER_ERROR") {
          throw new Error(`LinkedIn video processing failed: ${status}`);
        }
      }
      if (!available) throw new Error("LinkedIn video processing timed out (>60s). Try again shortly.");
    }

    shareMediaCategory = media.kind === "video" ? "VIDEO" : "IMAGE";
  }

  const body = mediaAsset
    ? {
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory,
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
    await postLinkedInAsWorkspace(payload.text, pickLiMedia(payload));
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
  // New unified media slot (image | pdf | video). Mutually exclusive w/ imageBase64.
  mediaKind: z.enum(["image", "pdf", "video"]).optional().nullable(),
  mediaBase64: z.string().max(28_000_000).optional().nullable(), // ~20MB binary
  mediaMime: z.string().max(80).optional().nullable(),
  mediaFilename: z.string().max(255).optional().nullable(),
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
    // strip heavy media blobs from list payloads
    const rows = (data ?? []).map((r: any) => {
      const p = { ...(r.payload ?? {}) };
      if (p.imageBase64) p.imageBase64 = "[image]";
      if (p.mediaBase64) p.mediaBase64 = `[${p.mediaKind ?? "media"}]`;
      return { ...r, payload: p };
    });
    return { rows };
  });

// Sent LinkedIn posts (read-only archive page)
export const listSentLinkedIn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { data, error } = await supabaseAdmin
      .from("approvals")
      .select("id, status, payload, notes, decided_at, created_at")
      .eq("requester_id", userId)
      .eq("kind", "outbound_linkedin")
      .eq("status", "sent")
      .order("decided_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((r: any) => {
      const p = { ...(r.payload ?? {}) };
      if (p.imageBase64) p.imageBase64 = "[image]";
      if (p.mediaBase64) p.mediaBase64 = `[${p.mediaKind ?? "media"}]`;
      return { ...r, payload: p };
    });
    return { rows };
  });

// ── Full payload (for editing) — includes stripped media blobs ───────────
const GetFullInput = z.object({ id: z.string().uuid() });
export const getOutboundFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => GetFullInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { data: row, error } = await supabaseAdmin
      .from("approvals")
      .select("id, kind, status, payload, requester_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Request not found");
    if (row.requester_id !== userId) throw new Error("Forbidden");
    return { payload: (row.payload ?? {}) as Record<string, any> };
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
    // Preserve image/media blobs (list strips them) unless explicitly overwritten
    const prev = (row.payload ?? {}) as Record<string, any>;
    const merged: Record<string, any> = { ...prev, ...data.payload };
    if (data.payload.imageBase64 === undefined && prev.imageBase64) {
      merged.imageBase64 = prev.imageBase64;
    }
    if (data.payload.mediaBase64 === undefined && prev.mediaBase64) {
      merged.mediaBase64 = prev.mediaBase64;
      merged.mediaKind = prev.mediaKind;
      merged.mediaMime = prev.mediaMime;
      merged.mediaFilename = prev.mediaFilename;
    }
    // If new media is being set, clear the legacy image slot (mutual exclusion)
    if (data.payload.mediaBase64) {
      merged.imageBase64 = null;
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
      model: "x-ai/grok-4.3",
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

// ── AI video generation (Kling v3.0 Std via OpenRouter) ─────────────────
// Returns a base64-encoded MP4 the client can attach to a LinkedIn draft.
const KlingInput = z.object({ prompt: z.string().min(3).max(2000) });
const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/v1/videos";
const KLING_MODEL = "kwaivgi/kling-v3.0-std";

export const generateKlingClipForOutbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => KlingInput.parse(i))
  .handler(async ({ data }) => {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) throw new Error("OPENROUTER_API_KEY missing");

    const startRes = await fetch(OPENROUTER_VIDEO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lovable.app",
        "X-Title": "VDNX Outbound",
      },
      body: JSON.stringify({ model: KLING_MODEL, prompt: data.prompt }),
    });
    const startText = await startRes.text();
    if (!startRes.ok) throw new Error(`Kling start failed (${startRes.status}): ${startText.slice(0, 300)}`);
    const job = JSON.parse(startText) as { id: string; polling_url?: string };
    if (!job.id) throw new Error("Kling returned no job id");

    const pollUrl = job.polling_url ?? `${OPENROUTER_VIDEO_URL}/${job.id}`;
    const deadline = Date.now() + 240_000;
    let videoUrl: string | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const pRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!pRes.ok) continue;
      const st = (await pRes.json()) as any;
      if (st.status === "completed") {
        videoUrl = st.unsigned_urls?.[0] ?? st.signed_urls?.[0] ?? st.urls?.[0] ?? null;
        break;
      }
      if (st.status === "failed") {
        const detail = typeof st.error === "string" ? st.error : st.error?.message ?? "no detail";
        throw new Error(`Kling failed: ${detail}`);
      }
    }
    if (!videoUrl) throw new Error("Kling timed out (>4 min)");

    const dl = await fetch(videoUrl);
    if (!dl.ok) throw new Error(`Video download failed (${dl.status})`);
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf.byteLength > 20_000_000) {
      throw new Error(`Generated video too large (${(buf.byteLength / 1_000_000).toFixed(1)} MB)`);
    }
    return {
      base64: buf.toString("base64"),
      mime: "video/mp4",
      filename: `kling-${Date.now()}.mp4`,
    };
  });

