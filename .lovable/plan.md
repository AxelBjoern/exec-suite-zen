
# Per-user accounts + chat-driven outbound + LinkedIn image gen

## 1. Per-user Gmail & LinkedIn (App User Connector OAuth)

Use Lovable's App User Connector flow (popup + `web_message`) so each user grants their own Gmail/LinkedIn access.

**Files**
- `src/integrations/lovable/appUserConnector.ts` — server-only `authorizeAppUserOAuth` + `callAsAppUser`.
- `src/integrations/lovable/appUserConnectorClient.ts` — browser popup helper `connectAppUser`.
- `src/lib/connections.functions.ts` — `startConnect(provider, targetOrigin)`, `saveConnection(provider, connectionId)`, `listMyConnections()`, `disconnect(provider)`.

**Table `user_connections`** (RLS: user reads/writes own)
- `user_id`, `provider` (`gmail`|`linkedin`), `connection_id`, `provider_email/name`, `connected_at`. Unique (`user_id`,`provider`).

**Page `/settings/connections`** — Gmail and LinkedIn cards with Connect / Reconnect / Disconnect + status pill.

## 2. Per-user guardrail toggle

**Table `user_settings`** (RLS: user reads/writes own)
- `user_id PK`, `auto_send_email bool default false`, `auto_send_linkedin bool default false`.

**`/settings` page** with two toggles. Default OFF (queue for owner approval). When ON, user's own requests bypass owner and send immediately via their own connection.

## 3. Send path: user's own connection

Rewrite the send step inside `approveOutbound` and the auto-send shortcut to use `callAsAppUser({ connectionId, connectorId: 'google_mail' | 'linkedin', ... })` with the **requester's** stored `connection_id`. If no connection exists for that provider → reject with "Connect your account in Settings first." Workspace connector stays only for owner-originated digest cron.

## 4. Chat-driven outbound (NEW: chat populates /outbound)

Chat does **not** auto-file. It detects intent, drafts the payload, and routes the user to `/outbound` with the form **pre-filled** for them to review, edit, and submit.

**Pipeline** (server-side, inside the chat send route):
1. After each user message, call a small classifier with `nousresearch/hermes-4-405b` via `src/server/llm.server.ts`:
   ```ts
   { kind: "email" | "linkedin" | "reminder" | "none",
     to?: string, subject?: string, body?: string, text?: string,
     missing?: string[] }
   ```
2. If `kind === "none"` → behave as normal chat.
3. If `missing` is non-empty (e.g. no recipient) → bot asks one clarifying question in chat; no draft yet.
4. If complete → bot replies with a short confirmation message **and a structured "draft" payload** attached to the assistant message:
   - "I've drafted an email to alex@example.com. **Open in Outbound →**"
   - The link goes to `/outbound?draft=<base64(json)>`.

**`/outbound` page changes**
- Read `?draft=` on mount. If present, decode → populate the matching card's inputs (email / reminder / linkedin) and scroll to it. The user reviews/edits, then clicks Submit (existing flow: respects toggle from §2).
- No silent inserts. Nothing leaves the system without an explicit Submit click.

**New files**
- `src/lib/chat-intent.functions.ts` — `parseOutboundIntent(text, history)` returning the structured shape above.
- `src/lib/draftLink.ts` — `encodeDraft(payload)` / `decodeDraft(qs)` helpers (URL-safe base64).
- Chat send route: inject classifier step + emit assistant message with the draft link.

## 5. LinkedIn: AI-generated image with tagline

When the draft is a LinkedIn post, also generate a square share image with a bold tagline overlay so the post has visual stopping power.

**Flow on `/outbound` when the LinkedIn card has a `text` value:**
1. New "Generate image" button under the textarea.
2. Server fn `generateLinkedInTagline(text)` → calls LLM to produce a 4–8 word tagline + a visual prompt.
3. Server route `/api/generate-linkedin-image` (streaming, server route — `createServerFn` can't stream) calls `https://ai.gateway.lovable.dev/v1/images/generations` with `openai/gpt-image-2`, `quality: "low"`, `stream: true`, `partial_images: 1`, square `1024x1024`.
   - Prompt composed as: `"{visual_prompt}. Bold sans-serif overlay text reading: '{tagline}'. High contrast, social-share friendly, no watermarks."`
4. Client streams previews into a preview pane (blur on partials, sharp on final — per AI Gateway pattern).
5. User can: **Regenerate** (new image), **Edit tagline** (re-prompt), or **Use this image**.
6. Selected image stored as base64 in the request payload (`payload.imageBase64`) on submission.

**Memory exception note** — the project memory says "all LLM calls go through OpenRouter via `src/server/llm.server.ts`". OpenRouter does not expose image generation through that route. I'll route the **tagline LLM call** through OpenRouter (Hermes 4 405B) per memory, and the **image pixels** through the Lovable AI Gateway image endpoint (this is the only image-gen path available; the memory rule applies to LLM calls, not image generation). If you'd rather skip image gen entirely, say so.

**Send step changes**
- When `approveOutbound` (or auto-send) processes an `outbound_linkedin` with `payload.imageBase64`:
  - First upload image as a LinkedIn asset (`/v2/assets?action=registerUpload` → PUT bytes), then post `ugcPosts` with `shareMediaCategory: "IMAGE"` referencing the asset URN.
  - If no image, current text-only `shareMediaCategory: "NONE"` path stays.

## 6. Approvals page changes
- Show requester email + provider used (own / workspace).
- For LinkedIn rows with an image, show a thumbnail in the preview.

## 7. UI surface
- Hub: add **Settings** tile (cog icon).
- `/settings` (new): links to Connections + guardrail toggles.
- `/settings/connections` (new): per-user OAuth.
- `/outbound`: reads `?draft=`, pre-fills card; LinkedIn card gains image-gen panel with preview + regen.
- `/chat`: detects intent, asks clarifying questions, emits assistant messages with **Open in Outbound** links.
- `/approvals`: unchanged behavior, adds image thumb.

## Technical notes
- App User Connector scopes: Gmail = `https://www.googleapis.com/auth/gmail.send`; LinkedIn = `w_member_social` + `openid profile email`.
- Intent classifier prompt is small and strict-JSON; falls back to `kind:"none"` on parse failure (chat just continues).
- Image base64 will inflate `approvals.payload` rows. Acceptable for now; if size becomes an issue we move to Supabase Storage with a signed URL (not in this scope).
- Per project memory: all LLM calls (intent classifier + tagline) use OpenRouter via `src/server/llm.server.ts` with Hermes 4 405B; image pixels via AI Gateway image endpoint.

## Out of scope (ask if wanted)
- Notify requester by email when owner approves/rejects.
- Token-refresh & expiry handling beyond a 401 → "reconnect" prompt.
- Image library / reuse of past images.
- Multi-image LinkedIn posts.
