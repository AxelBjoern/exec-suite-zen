## Goal
Let your board send emails / reminders via Gmail and publish posts via LinkedIn, using Lovable App Connectors (no per-user OAuth).

## Step 1 — Link the connectors
Use the in-chat connector picker to link both workspace connections to this project:
- **Gmail** (`google_mail`) — scopes needed: `gmail.send` (send mail/reminders). Add `gmail.readonly` only if the board should also read.
- **LinkedIn** (`linkedin`) — scope: `w_member_social` (publish posts as the connected member).

These authenticate **your** Gmail and LinkedIn account — every board user shares your account. (If you need each user to use their own accounts, that's a different per-user OAuth setup; tell me and I'll plan that instead.)

Secrets auto-injected after linking: `LOVABLE_API_KEY`, `GOOGLE_MAIL_API_KEY`, `LINKEDIN_API_KEY`.

## Step 2 — Server functions (TanStack `createServerFn`)
Create `src/lib/outbound.functions.ts` with three protected functions (gated by `requireSupabaseAuth`):

1. `sendGmail({ to, subject, body })` — builds RFC2822, base64url-encodes, POSTs to `connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send`.
2. `sendReminderToSelf({ subject, body })` — same as above but `to` = your configured owner email (stored as secret `OWNER_EMAIL` or read from the admin user's profile).
3. `postToLinkedIn({ text })` — fetches member URN via `/v2/userinfo`, then POSTs to `/v2/ugcPosts`.

Each gateway call uses headers `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${GOOGLE_MAIL_API_KEY|LINKEDIN_API_KEY}` and surfaces HTTP errors with status + body.

## Step 3 — Board UI hooks
In the board (Terminal / Forge action surface — confirm which), add three actions wired via `useServerFn`:
- "Send email" (compose to/subject/body)
- "Remind me" (subject/body → goes to owner)
- "Post to LinkedIn" (textarea)

Each shows toast on success/failure.

## Step 4 — Optional: scheduled reminders
If you want recurring reminders (e.g. daily digest), add a `pg_cron` + `pg_net` job calling a `/api/public/hooks/daily-reminder` server route (authenticated via Supabase anon key in `apikey` header) that invokes `sendReminderToSelf`. Skip unless you want it now.

## Out of scope
- Per-end-user Gmail/LinkedIn OAuth (each board user using their own accounts)
- Reading inbox / LinkedIn feed
- Rich HTML email templates (plain text first)
- Scheduling UI for reminders

## Questions before I build
1. Reminder recipient: hardcode one email as an `OWNER_EMAIL` secret, or pull from your logged-in admin profile?
2. Include the optional daily scheduled reminder (Step 4) now or later?
3. Where should the three action buttons live — Terminal, Forge, or a new "Outbound" panel on the hub?
