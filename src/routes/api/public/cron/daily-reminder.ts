import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function base64url(input: string) {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const Route = createFileRoute("/api/public/cron/daily-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const owner = process.env.OWNER_EMAIL;
        const lovableKey = process.env.LOVABLE_API_KEY;
        const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
        if (!owner || !lovableKey || !gmailKey) {
          return Response.json(
            { ok: false, error: "Missing OWNER_EMAIL / LOVABLE_API_KEY / GOOGLE_MAIL_API_KEY" },
            { status: 500 },
          );
        }

        const today = new Date().toISOString().slice(0, 10);
        const raw = base64url(
          [
            `To: ${owner}`,
            `Subject: [VDNX] Daily digest — ${today}`,
            'Content-Type: text/plain; charset="UTF-8"',
            "MIME-Version: 1.0",
            "",
            `Daily reminder from your VDNX board.\n\nDate: ${today}\n`,
          ].join("\r\n"),
        );

        const res = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": gmailKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error("daily-reminder gmail send failed", res.status, text);
          return Response.json({ ok: false, status: res.status, error: text }, { status: 502 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
