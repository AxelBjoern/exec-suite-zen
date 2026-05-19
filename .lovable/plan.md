
# Phase 4 (revised): Monday Board → Weekly Plan → Daily Reports

Same operating cadence as before. Two infrastructure swaps:

- **LLM**: All agent calls go to **Nous Research Hermes** via **OpenRouter** (instead of Lovable AI Gateway / Gemini / GPT).
- **Scheduler**: **Postgres `pg_cron` + `pg_net`** hitting `/api/public/*` server routes (instead of Inngest). No external durable runtime.

```text
MON 08:00  Board meeting → weekly plan draft  →  awaits your approval
MON–FRI    Approved action items auto-execute (pg_cron tick every minute drains a job queue)
TUE–FRI    Daily standup report per agent at 08:00
FRI 17:00  End-of-week recap → seeds next Monday's board
```

## 1. LLM swap → Hermes via OpenRouter

- New helper `src/server/llm.server.ts` exposing `chatCompletion({ messages, tools, tool_choice, temperature })` that POSTs to `https://openrouter.ai/api/v1/chat/completions`.
- Default model: `nousresearch/hermes-4-405b` (configurable via `HERMES_MODEL` env, fallback `nousresearch/hermes-3-llama-3.1-405b`).
- Reads `OPENROUTER_API_KEY` from `process.env`. Sets `HTTP-Referer` + `X-Title` headers per OpenRouter convention.
- Existing tool-calling shapes in `src/lib/agent-schemas.ts` (`ARTIFACT_TOOL`, `CONSULT_TOOL`, `CHAT_TOOL`, `ROUTE_TOOL`) are already OpenAI-compatible — Hermes models support OpenAI tool-calling, so no schema changes.
- Replace every `fetch("https://ai.gateway.lovable.dev/...")` call in `terminal.functions.ts` (and any agent helper) with `chatCompletion(...)`. Surface 429 / 402 / non-200 errors back to the client as before.
- New secret to request: **`OPENROUTER_API_KEY`** (via `add_secret`). `LOVABLE_API_KEY` is no longer needed by agents (kept only if other code uses it).

## 2. Scheduler swap → pg_cron + pg_net

No Inngest, no connector. Three public route endpoints, each protected by the Supabase anon key in an `apikey` header:

- `POST /api/public/cron/monday-board` — runs the boardroom dispatch and writes the weekly plan + parent approval (`kind:'weekly_plan'`).
- `POST /api/public/cron/daily-reports` — fans out a freeform "report progress" prompt to each active agent, posts to a `kind=standup` thread, creates `suggestions` rows.
- `POST /api/public/cron/weekly-recap` — CEO solo, writes `kind=recap` artifact.
- `POST /api/public/cron/job-tick` — runs every minute. Drains a small `job_queue` table (max N per tick): `runTask(task_id)` for queued task runs, plus operator-defined schedules whose `next_run_at <= now()`. Includes the **depth guard** (max 3) so chains can't loop.
- `POST /api/public/cron/approval-overdue` — every 15 min, finds approvals pending >24h and pings CEO.

`supabase/insert` (not migration) registers the cron schedules with `cron.schedule(...)` calling these URLs via `net.http_post` with `apikey` header.

### Why a job_queue + tick instead of direct cron-per-task

`pg_cron` resolution is 1 minute and global. We can't schedule one cron per task or per operator schedule. Instead, **anything that needs to "run later"** — approved plan items, retries, operator schedules — inserts a row into `job_queue (id, kind, payload, run_at, attempts, status)`. The single `job-tick` route claims due rows in a transaction (`SELECT ... FOR UPDATE SKIP LOCKED`) and executes them. This gives us durability + retries without an external system.

## 3. Weekly plan approval (unchanged from prior plan)

- `WeeklyPlanPanel` shows the latest `kind=weekly_plan` artifact + every proposed action item.
- **Approve week** flips child tasks `blocked → todo` and inserts one `job_queue` row per `auto_dispatch:true` item.
- External actions (post / send / publish / email) still hit their per-task approval gate when their job runs.

## 4. Daily suggestions (unchanged)

- Agents flag "needs operator decision" → `suggestions` row → strip in Terminal with one-tap approve/dismiss.

## Schema additions (single migration)

- `tasks.depth int default 0`
- `tasks.kind text` — `'plan_item' | 'standup' | 'ad_hoc'`
- `threads.kind text default 'solo'` — `'board' | 'standup' | 'recap' | 'solo'`
- `approvals.kind text default 'task'` — `'weekly_plan' | 'task'`
- `suggestions` table (id, agent_slug, thread_id, title, body, status, created_at)
- `schedules` table (id, name, cron, agent_slug, mode, verb, args, prompt, active, last_run_at, next_run_at)
- `job_queue` table (id, kind, payload jsonb, run_at, attempts int default 0, status `pending|running|done|failed`, last_error text, created_at)
- Indexes on `job_queue (status, run_at)` and `schedules (active, next_run_at)`.

## Files

**Add**
- `src/server/llm.server.ts` — Hermes/OpenRouter client.
- `src/routes/api/public/cron/monday-board.ts`
- `src/routes/api/public/cron/daily-reports.ts`
- `src/routes/api/public/cron/weekly-recap.ts`
- `src/routes/api/public/cron/job-tick.ts`
- `src/routes/api/public/cron/approval-overdue.ts`
- `src/serverfns/tasks.functions.ts` — `runTask`, `approveWeeklyPlan`, `enqueueJob`.
- `src/serverfns/suggestions.functions.ts`
- `src/serverfns/schedules.functions.ts`
- `src/components/WeeklyPlanPanel.tsx`
- `src/components/DailySuggestions.tsx`
- `src/components/SchedulesPanel.tsx`

**Edit**
- `src/serverfns/terminal.functions.ts` — route LLM calls through `llm.server.ts`; on board mode write parent approval as `kind:'weekly_plan'`.
- `src/components/Terminal.tsx` — mount `WeeklyPlanPanel` + `DailySuggestions` + auto-route toggle + router trace.

**No edits to** `agent-schemas.ts` (OpenAI-compatible already).

## Setup before code

Just one secret: **`OPENROUTER_API_KEY`** (https://openrouter.ai/keys). Cron URLs use the existing Supabase publishable key for the `apikey` header — no extra secret.

## Out of scope

- Auto-approving external actions.
- Streaming agent responses.
- Multi-tenant scheduling.
