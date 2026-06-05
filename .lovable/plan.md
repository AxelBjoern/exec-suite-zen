
# Per-user outbound + owner approval

## Goals
1. Each user connects their own Gmail and LinkedIn (not the shared workspace connector).
2. No email or LinkedIn post leaves the system until **you (OWNER_EMAIL)** explicitly approve it.

## Architecture

### Per-user OAuth (replaces builder connector for end users)
- Add Google OAuth (Gmail scopes: `gmail.send`) and LinkedIn OAuth (`w_member_social`, `openid profile email`) as per-user flows.
- New table `user_connections`: `user_id`, `provider` (`gmail` | `linkedin`), `access_token`, `refresh_token`, `expires_at`, `scope`, `provider_user_id`. RLS: user can only read/delete own rows; service role for token refresh.
- New page `/settings/connections` with "Connect Gmail" / "Connect LinkedIn" buttons → start OAuth → callback route `/api/public/oauth/{provider}/callback` exchanges code, stores tokens.
- Your existing workspace Gmail/LinkedIn connectors stay as **your** personal connection (you connect via the same per-user flow as the owner account). Remove the shared-fallback behavior from `outbound.functions.ts`.

### Approval gate (the guardrail)
- New table `outbound_requests`: `id`, `requester_id`, `provider` (`gmail`|`linkedin`), `payload` (jsonb: to/subject/body or post text), `status` (`pending`|`approved`|`rejected`|`sent`|`failed`), `approved_by`, `approved_at`, `sent_at`, `error`, `created_at`.
- RLS: requester sees own rows; only owner (`has_role(auth.uid(),'owner')` or email match to `OWNER_EMAIL`) sees all and can approve/reject.
- New `app_role` value `owner`; seed your user_id into `user_roles` as `owner`.

### Flow
1. User fills Outbound form → server fn `requestOutbound()` inserts a `pending` row. **Nothing is sent.**
2. User gets toast: "Sent for owner approval."
3. You see an **Approvals inbox** at `/approvals` listing pending requests with full preview (to, subject, body / post text, requester). Approve / Reject buttons.
4. Approve → server fn `approveOutbound(id)` (owner-only):
   - Loads requester's `user_connections` token for the right provider (refreshes if expired).
   - Calls Gmail `messages/send` or LinkedIn `ugcPosts` **as the requester**.
   - Updates row to `sent` or `failed` + error.
5. Reject → marks `rejected` with optional reason. Requester is notified (email to requester via your owner Gmail, optional v2).
6. Owner self-sends (you composing from Outbound): still goes through the same queue but auto-approves if `requester_id === owner_id` — OR keep manual for full audit trail (recommend keep manual; one click).

### Daily digest cron
- Keep existing cron, but switch it to send the **pending approvals digest** to OWNER_EMAIL (count + links) using your owner Gmail token, not the workspace connector.

## UI changes
- `/outbound` — submit form now says "Request to send" + shows last 10 own requests with status badges.
- `/approvals` — new owner-only page (hidden from non-owners in ModuleSwitcher/Hub).
- `/settings/connections` — manage own Gmail/LinkedIn link + disconnect.
- Hub tile: "Approvals (3 pending)" for owner only.

## Removals
- `sendGmail`, `sendReminderToSelf`, `postToLinkedIn` direct-send paths in `src/lib/outbound.functions.ts` are replaced by `requestOutbound` (queue) + `approveOutbound` (owner-only actual send).

## Technical details
- OAuth credentials: you create one Google Cloud OAuth app + one LinkedIn Developer app, paste `GOOGLE_OAUTH_CLIENT_ID`/`SECRET` and `LINKEDIN_OAUTH_CLIENT_ID`/`SECRET` as secrets. (Workspace connectors authenticate only YOU; for other users to connect their own accounts we need our own OAuth app — provider requirement, not a Lovable limitation.)
- Token refresh: Gmail refresh token via `oauth2.googleapis.com/token`; LinkedIn tokens last ~60 days, no refresh — prompt re-connect on 401.
- All sends remain server-side in `createServerFn` with `requireSupabaseAuth`; approval action additionally checks `has_role(auth.uid(),'owner')`.

## Open question
Self-sends by you: auto-approve, or require you to click approve on your own drafts too (stronger audit, one extra click)? Default in plan: **manual approve even for yourself** unless you say otherwise.
