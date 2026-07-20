// channel-sender.server.ts — outbound sender per channel (Telegram first).
// Server-only. Never import from client-reachable modules at module scope;
// dynamic-import from route/server-fn handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://connector-gateway.lovable.dev";

export type SendResult = { ok: true; external_message_id: string } | { ok: false; error: string };

async function sendTelegram(chatId: string, text: string): Promise<SendResult> {
  const key = process.env.TELEGRAM_API_KEY;
  const lk = process.env.LOVABLE_API_KEY;
  if (!key || !lk) return { ok: false, error: "TELEGRAM_API_KEY or LOVABLE_API_KEY not configured" };
  const r = await fetch(`${GATEWAY}/telegram/sendMessage`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lk}`,
      "X-Connection-Api-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await r.text();
  if (!r.ok) return { ok: false, error: `telegram ${r.status}: ${body.slice(0, 400)}` };
  let json: any;
  try { json = JSON.parse(body); } catch { return { ok: false, error: `telegram non-json: ${body.slice(0, 200)}` }; }
  if (!json?.ok) return { ok: false, error: `telegram: ${json?.description ?? "unknown"}` };
  return { ok: true, external_message_id: String(json.result.message_id) };
}

export async function sendChannelReply(opts: {
  lead_id: string;
  channel: string;
  external_chat_id: string;
  text: string;
}): Promise<SendResult> {
  const { lead_id, channel, external_chat_id, text } = opts;
  let sent: SendResult;
  if (channel === "telegram") sent = await sendTelegram(external_chat_id, text);
  else return { ok: false, error: `unsupported channel: ${channel}` };
  if (!sent.ok) return sent;
  // Log outbound row for the thread.
  await supabaseAdmin.from("lead_replies").insert({
    lead_id, body: text, channel, direction: "out",
    external_message_id: sent.external_message_id,
    classification: "sent",
  });
  return sent;
}
