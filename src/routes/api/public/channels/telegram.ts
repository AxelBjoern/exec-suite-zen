// Telegram webhook — receives inbound messages, links chats to VDNX users
// via a one-time `/link CODE` handshake, then writes messages into the
// existing `lead_replies` inbound pipeline for triage.
import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function deriveSecret(apiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${apiKey}`).digest("base64url");
}
function safeEqual(a: string, b: string): boolean {
  const l = Buffer.from(a), r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
}

export const Route = createFileRoute("/api/public/channels/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.TELEGRAM_API_KEY;
        if (!key) return new Response("TELEGRAM_API_KEY not configured", { status: 500 });
        const expected = deriveSecret(key);
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

        const update = await request.json().catch(() => null);
        const msg = update?.message ?? update?.edited_message;
        if (!msg?.chat?.id || typeof update?.update_id !== "number") {
          return Response.json({ ok: true, ignored: true });
        }
        const chatId = String(msg.chat.id);
        const text: string = typeof msg.text === "string" ? msg.text : "";
        const fromUser = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name ?? "telegram user");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendChannelReply } = await import("@/server/channel-sender.server");

        // Handshake: /link CODE
        const linkMatch = text.trim().match(/^\/link\s+([A-Za-z0-9]{4,12})\s*$/i);
        if (linkMatch) {
          const code = linkMatch[1].toUpperCase();
          const { data: binding } = await supabaseAdmin
            .from("channel_bindings")
            .select("id, owner_id, link_expires_at")
            .eq("channel", "telegram")
            .eq("link_code", code)
            .maybeSingle();
          if (!binding || (binding.link_expires_at && new Date(binding.link_expires_at) < new Date())) {
            await sendTgReply(chatId, "That link code is invalid or expired. Generate a fresh one in VDNX Settings → Channel Inbox.");
            return Response.json({ ok: true, linked: false });
          }
          await supabaseAdmin.from("channel_bindings").update({
            external_chat_id: chatId,
            verified_at: new Date().toISOString(),
            link_code: null,
            link_expires_at: null,
          }).eq("id", binding.id);
          await sendTgReply(chatId, "Linked. Messages here will now flow into your VDNX inbox for triage.");
          return Response.json({ ok: true, linked: true });
        }

        // Resolve bound owner for this chat
        const { data: binding } = await supabaseAdmin
          .from("channel_bindings")
          .select("owner_id, auto_reply")
          .eq("channel", "telegram")
          .eq("external_chat_id", chatId)
          .not("verified_at", "is", null)
          .maybeSingle();
        if (!binding?.owner_id) {
          await sendTgReply(chatId, "This chat isn't linked to a VDNX account. Send `/link CODE` using a code from VDNX Settings → Channel Inbox.");
          return Response.json({ ok: true, unbound: true });
        }

        // Upsert synthetic lead for this (channel, chat)
        const { data: existingLead } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("channel", "telegram")
          .eq("external_chat_id", chatId)
          .maybeSingle();
        let leadId = existingLead?.id as string | undefined;
        if (!leadId) {
          const { data: ins, error: leadErr } = await supabaseAdmin
            .from("leads")
            .insert({
              channel: "telegram",
              external_chat_id: chatId,
              owner_id: binding.owner_id,
              full_name: fromUser,
              status: "inbound",
            })
            .select("id")
            .single();
          if (leadErr) return Response.json({ ok: false, error: leadErr.message }, { status: 500 });
          leadId = ins.id;
        }

        // Insert inbound reply (idempotent on external_message_id)
        const externalMsgId = String(update.update_id);
        const { error: replyErr } = await supabaseAdmin
          .from("lead_replies")
          .upsert({
            lead_id: leadId,
            body: text || "[non-text message]",
            channel: "telegram",
            direction: "in",
            external_message_id: externalMsgId,
          }, { onConflict: "channel,external_message_id" });
        if (replyErr) return Response.json({ ok: false, error: replyErr.message }, { status: 500 });

        // Fast ack (optional) — the triage cron will draft & queue approval.
        if (binding.auto_reply) {
          // No-op here; approval-sweeper + a channel outbound step handles auto-send.
        }
        return Response.json({ ok: true });

        async function sendTgReply(chat: string, body: string) {
          await sendChannelReply({
            lead_id: "00000000-0000-0000-0000-000000000000",
            channel: "telegram",
            external_chat_id: chat,
            text: body,
          }).catch(() => {});
        }
      },
    },
  },
});
