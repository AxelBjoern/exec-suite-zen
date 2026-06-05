import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${text}`);
  }
  return res.json();
}

const SendEmailSchema = z.object({
  to: z.string().email().max(320),
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(20000),
});

export const sendGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendEmailSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await sendGmailRaw(data.to, data.subject, data.body);
    return { ok: true, id: result?.id ?? null };
  });

const ReminderSchema = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(20000),
});

export const sendReminderToSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReminderSchema.parse(input))
  .handler(async ({ data }) => {
    const owner = process.env.OWNER_EMAIL;
    if (!owner) throw new Error("OWNER_EMAIL secret is not configured");
    const result = await sendGmailRaw(owner, `[Reminder] ${data.subject}`, data.body);
    return { ok: true, id: result?.id ?? null, to: owner };
  });

const PostSchema = z.object({
  text: z.string().min(1).max(3000),
});

export const postToLinkedIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PostSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LINKEDIN_API_KEY!;
    const headers = gwHeaders(key);

    const meRes = await fetch(`${LINKEDIN_GATEWAY}/v2/userinfo`, {
      method: "GET",
      headers,
    });
    if (!meRes.ok) {
      throw new Error(`LinkedIn userinfo failed (${meRes.status}): ${await meRes.text()}`);
    }
    const me = (await meRes.json()) as { sub?: string };
    if (!me.sub) throw new Error("LinkedIn userinfo missing sub");
    const author = `urn:li:person:${me.sub}`;

    const body = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: data.text },
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
    if (!postRes.ok) {
      throw new Error(`LinkedIn post failed (${postRes.status}): ${await postRes.text()}`);
    }
    const out = await postRes.json();
    return { ok: true, id: out?.id ?? null };
  });
