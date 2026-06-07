import { createFileRoute } from "@tanstack/react-router";
import { PDFDocument } from "pdf-lib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkCronAuth } from "@/server/cron-auth.server";

// Workspace senders (shared connectors). Kept inline to avoid pulling client deps.
const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const LINKEDIN_GATEWAY = "https://connector-gateway.lovable.dev/linkedin";
const PDF_MAX_PAGES = 10;

type LiMediaKind = "image" | "pdf" | "video";
function pickMedia(p: any): { kind: LiMediaKind; base64: string; mime: string; filename: string } | null {
  if (p?.mediaKind && p?.mediaBase64) {
    const kind = p.mediaKind as LiMediaKind;
    return {
      kind,
      base64: p.mediaBase64,
      mime: p.mediaMime ?? (kind === "pdf" ? "application/pdf" : kind === "video" ? "video/mp4" : "image/png"),
      filename: p.mediaFilename ?? (kind === "pdf" ? "carousel.pdf" : kind === "video" ? "clip.mp4" : "image.png"),
    };
  }
  if (p?.imageBase64) return { kind: "image", base64: p.imageBase64, mime: "image/png", filename: "image.png" };
  return null;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function rawEmail(to: string, subject: string, body: string) {
  return b64url(
    Buffer.from(
      [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "MIME-Version: 1.0",
        "",
        body,
      ].join("\r\n"),
      "utf-8",
    ),
  );
}
async function sendGmail(to: string, subject: string, body: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) throw new Error("Gmail connector not configured");
  const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: rawEmail(to, subject, body) }),
  });
  if (!res.ok) throw new Error(`Gmail (${res.status}): ${await res.text()}`);
}
async function postLinkedIn(text: string, media: ReturnType<typeof pickMedia>) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const liKey = process.env.LINKEDIN_API_KEY;
  if (!lovableKey || !liKey) throw new Error("LinkedIn connector not configured");
  const h = { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": liKey };
  const me = await fetch(`${LINKEDIN_GATEWAY}/v2/userinfo`, { headers: h });
  if (!me.ok) throw new Error(`LI userinfo (${me.status})`);
  const { sub } = (await me.json()) as { sub?: string };
  if (!sub) throw new Error("LI userinfo missing sub");
  const author = `urn:li:person:${sub}`;

  let mediaAsset: string | null = null;
  let category: "NONE" | "IMAGE" | "DOCUMENT" | "VIDEO" = "NONE";
  if (media) {
    const recipe = {
      image: "urn:li:digitalmediaRecipe:feedshare-image",
      pdf: "urn:li:digitalmediaRecipe:feedshare-document",
      video: "urn:li:digitalmediaRecipe:feedshare-video",
    }[media.kind];
    if (media.kind === "pdf") {
      const doc = await PDFDocument.load(Buffer.from(media.base64, "base64"));
      if (doc.getPageCount() > PDF_MAX_PAGES) {
        throw new Error(`PDF exceeds ${PDF_MAX_PAGES}-page limit`);
      }
    }
    const reg = await fetch(`${LINKEDIN_GATEWAY}/v2/assets?action=registerUpload`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: [recipe],
          owner: author,
          serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
        },
      }),
    });
    if (!reg.ok) throw new Error(`LI register (${reg.status})`);
    const j = (await reg.json()) as any;
    const uploadUrl = j?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    mediaAsset = j?.value?.asset ?? null;
    if (!uploadUrl || !mediaAsset) throw new Error("LI register missing upload data");
    const up = await fetch(uploadUrl, {
      method: "PUT", headers: { "Content-Type": media.mime },
      body: Buffer.from(media.base64, "base64"),
    });
    if (!up.ok) throw new Error(`LI upload (${up.status})`);
    if (media.kind === "video") {
      const assetId = mediaAsset.split(":").pop();
      const deadline = Date.now() + 60_000;
      let ok = false;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await fetch(`${LINKEDIN_GATEWAY}/v2/assets/${assetId}`, { headers: h });
        if (!s.ok) continue;
        const sj = (await s.json()) as any;
        const status = sj?.recipes?.[0]?.status ?? sj?.status;
        if (status === "AVAILABLE") { ok = true; break; }
        if (status?.includes("FAILED") || status?.includes("ERROR")) throw new Error(`LI video ${status}`);
      }
      if (!ok) throw new Error("LI video processing timed out");
    }
    category = { image: "IMAGE", pdf: "DOCUMENT", video: "VIDEO" }[media.kind] as any;
  }

  const mediaArray = mediaAsset
    ? [media!.kind === "pdf"
        ? { status: "READY", media: mediaAsset, title: { text: media!.filename.replace(/\.pdf$/i, "") } }
        : { status: "READY", media: mediaAsset }]
    : [];

  const body = mediaAsset
    ? { author, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text }, shareMediaCategory: category, media: mediaArray } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" } }
    : { author, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" } };
  const res = await fetch(`${LINKEDIN_GATEWAY}/v2/ugcPosts`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LI post (${res.status}): ${await res.text()}`);
}

export const Route = createFileRoute("/api/public/cron/scheduled-outbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkCronAuth(request);
        if (auth) return auth;

        const nowIso = new Date().toISOString();
        const { data: rows, error } = await supabaseAdmin
          .from("approvals")
          .select("id, kind, payload")
          .eq("status", "pending")
          .in("kind", ["outbound_email", "outbound_reminder", "outbound_linkedin"])
          .limit(20);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: any[] = [];
        for (const r of rows ?? []) {
          const p = (r.payload ?? {}) as any;
          if (!p.scheduled_at) continue;
          const t = Date.parse(p.scheduled_at);
          if (!Number.isFinite(t) || t > Date.now()) continue;
          try {
            if (r.kind === "outbound_linkedin") {
              await postLinkedIn(p.text, pickMedia(p));
            } else {
              await sendGmail(p.to, p.subject, p.body);
            }
            await supabaseAdmin.from("approvals").update({
              status: "sent", decided_at: nowIso, notes: "auto-sent (scheduled)",
            }).eq("id", r.id);
            results.push({ id: r.id, ok: true });
          } catch (e: any) {
            await supabaseAdmin.from("approvals").update({
              status: "failed", decided_at: nowIso, notes: `scheduled send failed: ${e?.message ?? e}`,
            }).eq("id", r.id);
            results.push({ id: r.id, ok: false, error: e?.message });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
