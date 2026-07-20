## Part 1 — "Available for Swarm" toggle on Agents & Models

### DB
Migration adds one column:
- `base_models.swarm_eligible boolean not null default false`, backfilled `true` for the 7 text models (Kling stays false).

### UI
`src/routes/_authenticated/agents-models.tsx`: add a small `Switch` labelled "Swarm" on each Models row. Own rows toggle directly; VDNX defaults show it disabled with tooltip "Clone to change" (matches existing edit/clone pattern). Update invalidates `["am","base_models"]` + `["swarm-config"]`.

### Swarm picker filter
`src/serverfns/swarm.functions.ts` → `getSwarmConfig`: filter `available` to models where `swarm_eligible = true` OR currently selected as drafter/synth/agent (so existing configs don't break). `SwarmPopover.tsx` and `swarm-bench.tsx` need no changes.

---

## Part 2 — Channel Inbox reusing existing inbound infra

Reuse what's already there (`leads`, `lead_replies`, `sales` triage agent, `lead-reply-triage` cron, `approvals`) instead of building a parallel messaging stack. Telegram/WhatsApp messages become `lead_replies` on a synthetic lead per external chat, get triaged by the existing agent, and the human-approved draft is sent back on the same channel.

### DB (thin additions)
- `leads`: add nullable `channel text` and `external_chat_id text`; unique `(channel, external_chat_id) where channel is not null`.
- `lead_replies`: add nullable `channel text`, `external_message_id text`, `direction text default 'in'`. Unique `(channel, external_message_id) where external_message_id is not null` for webhook idempotency.
- `channel_bindings` (new, tiny) — `owner_id`, `channel`, `external_chat_id`, `verified_at`, `link_code`, `link_expires_at`. RLS owner-only. Used to bind a Telegram chat to a VDNX user via a `/link <code>` handshake before any triage runs.

All new columns/tables get proper GRANTs + RLS scoped to `auth.uid()` (leads/lead_replies already are).

### Telegram webhook (first channel)
`src/routes/api/public/channels/telegram.ts` — verifies `X-Telegram-Bot-Api-Secret-Token` (base64url sha256 of `telegram-webhook:${TELEGRAM_API_KEY}`, per telegram knowledge). On each update:
1. If text is `/link <code>` — match against `channel_bindings.link_code`, set `verified_at`, reply "Linked to <email>".
2. Otherwise, resolve the bound owner. If no binding, static reply "Send `/link <code>` from VDNX Settings → Channels to connect." and stop.
3. Upsert a synthetic `leads` row (`channel='telegram'`, `external_chat_id=chat.id`, `owner_id=<bound owner>`, `name=@username`).
4. Insert into `lead_replies` with `direction='in'`, `channel='telegram'`, `external_message_id=update_id`, `body=text`, `classification=null` — which is exactly what the existing `lead-reply-triage` cron already picks up.

### Reply-out plumbing
`src/server/agent-tools.server.ts` → extend `db.draft_lead_reply` (or add a sibling `db.send_channel_reply` tool that the sales agent can also call). When the reply's parent lead has a `channel`, the eventual approved-send path routes to a new sender:
- `src/server/channel-sender.server.ts`: given `(channel, external_chat_id, text)`, calls Telegram `sendMessage` via connector gateway (`https://connector-gateway.lovable.dev/telegram/sendMessage`, `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${TELEGRAM_API_KEY}`). On success writes an outbound `lead_replies` row (`direction='out'`, `external_message_id=result.message_id`).
- Wire into wherever approved lead-reply drafts currently get sent (approvals sweep / send action) — branch on `lead.channel`: email path stays untouched, `telegram` path calls the channel sender.

### Optional "auto-reply without approval"
Per-conversation toggle stored on `channel_bindings.auto_reply boolean default false`. When true, triage cron calls the sender directly with the drafted reply and marks the approval auto-approved (reuses existing `auto_approve_rules`). Off by default so replies still land in the existing Approvals inbox.

### Settings UI
`src/routes/_authenticated/settings/connections.tsx` — new "Channel Inbox" card:
- "Link Telegram" → generates a 6-char code into `channel_bindings`, shows "DM your bot: `/link ABC123`".
- Lists bound chats with per-chat auto-reply toggle + unlink.

### WhatsApp
Same shape via Twilio (`/api/public/channels/whatsapp`, X-Twilio-Signature verification, `channel='whatsapp'`). Only built when you paste Twilio creds — otherwise deferred.

### Setup step after deploy
I'll register the webhook once via `standard_connectors--call_gateway_connection` → `/setWebhook` with the derived secret against `https://project--<project-id>-dev.lovable.app/api/public/channels/telegram`.

---

## Build order
1. Migration + swarm-eligible toggle + swarm filter.
2. Migration for lead/lead_replies channel columns + `channel_bindings` + Settings link UI.
3. Telegram webhook + link handshake + channel sender + branch approved-send path.
4. WhatsApp/Twilio only on request.

Confirm and I'll build 1–3.