## Plan

### 1. Restrict VDNX terminal + agents to axel@natax.co.uk

**Route gate** — `src/routes/_authenticated/terminal.tsx`
- Add `beforeLoad` that reads the current user's email from Supabase auth claims. If it is not `axel@natax.co.uk`, `throw redirect({ to: "/" })`.

**Server-side gate** — `src/serverfns/terminal.functions.ts` and `src/serverfns/ceo-chat.functions.ts`
- After `requireSupabaseAuth`, check `context.claims.email`. If not the VDNX owner, throw `Error("Forbidden: VDNX terminal is restricted")` before any dispatch / model call.
- Same guard added to `src/server/cadence.server.ts` callers and the cron entrypoints that fan out VDNX agent work (`daily-reports.ts`, `monday-board.ts`, `daily-reminder.ts`) — these already run as axel via `OWNER_EMAIL`, so they keep working; just make the guard explicit.

**Prompt gating** — `src/lib/agent-prompts.ts`
- Keep `VDNX_UNICORN_DIRECTIVE` and the role-specific prompts, but make `DEFAULT_COMPANY_CONTEXT` a neutral fallback. Add `getCompanyContextForEmail(email)` that returns `VDNX_UNICORN_DIRECTIVE` for `axel@natax.co.uk` and a generic short context for anyone else.
- Update `buildSystemPrompt` / `buildRouterPrompt` callers in `terminal.functions.ts`, `cadence.server.ts`, `daily-reports.ts` to pass the resolved per-user context instead of the hard-coded default.

**Nav** — `src/components/ModuleSwitcher.tsx` (and any other place that links to `/terminal`)
- Hide the Terminal link unless the logged-in email is axel's. Read email from the existing auth context / a small `useIsVdnxOwner()` hook.

Net effect: only axel sees and can hit `/terminal`, only his requests load the VDNX agents + directive, everyone else gets a clean 404/redirect with a generic context if they somehow reach the dispatch fn.

### 2. Per-user model allowlist (Settings → Models)

**Schema** — new migration
- Add column `chat_model_allowlist text[] null` to `public.user_settings` (null = "all 8 allowed", non-null = explicit list of allowed IDs). No new table.
- `GRANT` already covers user_settings; no new grants needed.

**Server functions** — extend `src/lib/connections.functions.ts` (or a new `src/lib/models.functions.ts`)
- `getMyModelAllowlist()` → returns `{ allowed: ChatModelId[] }`, defaulting to all 8 IDs from `CHAT_MODEL_OPTIONS` when null.
- `updateMyModelAllowlist({ allowed })` → validates each ID is in `CHAT_MODEL_OPTIONS`, writes back (empty array forbidden — minimum 1).
- Enforcement: `src/server/llm.server.ts` `resolveChatModel` (or the chat serverFn that calls it) checks the requested model is in the caller's allowlist; rejects with a clean error otherwise.

**Settings page** — new file `src/routes/_authenticated/settings/models.tsx`
- Lists all 8 `CHAT_MODEL_OPTIONS` with name + slug + a Switch per row.
- "Save" calls `updateMyModelAllowlist`. Toast + invalidate query.
- Link added on `src/routes/_authenticated/settings/index.tsx` ("Models — Manage →"), same pattern as Connections / Design Rules.

**Chat picker** — `src/routes/_authenticated/chat.tsx`
- On mount, load the user's allowlist via TanStack Query and filter `CHAT_MODEL_OPTIONS` before rendering the `<Select>`. If the persisted selected model is no longer allowed, fall back to the first allowed one.

### Technical notes
- The "8 allowed models" Core memory still holds — the allowlist only narrows within those 8, never adds new slugs.
- VDNX owner email is centralized: reuse `VDNX_OWNER_EMAIL` from `src/server/designRules.server.ts` (export it) instead of re-declaring the string. Add a matching client constant `src/lib/vdnx.ts` for the nav guard.
- No edge functions touched; everything stays in TanStack server functions per project rules.
