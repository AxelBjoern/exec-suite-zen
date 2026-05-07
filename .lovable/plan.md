# Phase 4 (revised): Monday Board → Weekly Plan → Daily Reports

The autonomous loop is reframed around your actual operating cadence: one Monday boardroom sets the week, you approve it, agents execute it Tue–Fri, and each agent reports to you every morning.

## The weekly loop

```text
MON 08:00  Board meeting → weekly plan draft  →  awaits your approval
           │
           ▼ (you approve in Terminal)
MON–FRI    Agents auto-execute approved action items
           │
           ▼
TUE–FRI    Daily standup report per agent at 08:00
           │
           ▼
FRI 17:00  End-of-week recap → seeds next Monday's board
```

Three moving parts: **Monday board**, **weekly plan + approval**, **daily reports**. Everything else (watchers, ad-hoc dispatch, auto-route) stays as already built.

## 1. Monday board meeting (cron: 0 8 * * 1)

Inngest function `monday-board` runs a real boardroom dispatch:
- CEO is primary, consults CFO + COO + CMO (whichever exist).
- Prompt is generated from: company_context, last week's `decision_log`, open `tasks`, blocked `approvals`, and the previous Friday recap.
- Output is a single artifact titled "Week of {date} — Plan" with `action_items[]` covering the week (owner_agent, task, deliverable, due, auto_dispatch).
- The whole artifact is wrapped in **one parent approval** (`kind: "weekly_plan"`) — not one approval per item. You approve the week as a block.
- Posted to a dedicated thread `kind=board` so it's easy to find.

## 2. Weekly plan approval

New UI: **"This week" panel** at top of Terminal on Mondays.
- Shows the plan artifact + every proposed action item with owner.
- Buttons: **Approve week**, **Reject**, **Edit** (strike items before approving).
- On approve: all child tasks flip from `blocked` → `todo` and emit `agent/task.ready` events. Inngest `task-runner` then calls `runTask()` per child with retries + depth guard (max 3).
- External actions (email, etc.) still hit their own per-task approval gate when their time comes — weekly approval ≠ blanket approval to send things on your behalf.

## 3. Daily reports (cron: 0 8 * * 2-5)

Inngest function `daily-agent-reports` fans out to every active agent:
- Each agent runs a freeform dispatch: *"Report progress on your open tasks. List what's done, what's blocked, what you propose next. Flag anything needing operator decision."*
- Output goes to a `kind=standup` thread, one message per agent, grouped under a single date header.
- Any "needs operator decision" item creates a lightweight `suggestion` row (new table) shown in a **Today's suggestions** strip in the Terminal — one-tap approve/dismiss.
- No daily report on Mondays (board covers it) or weekends.

## 4. Friday recap (cron: 0 17 * * 5)

`weekly-recap` runs CEO solo with the week's `decision_log` + completed/blocked tasks. Stores artifact in a `kind=recap` thread. The next Monday board reads it.

## 5. Watchers (kept from prior plan)

- `approval-overdue-watcher` (*/15 * * * *): if any approval has been pending >24h, ping CEO with a freeform prompt summarizing it.
- `tool-call-failed` (event): on Resend / external failure, route to owner agent for diagnosis + proposal.

## 6. Operator-defined schedules

Same `schedules` table + `SchedulesPanel` as before, for any custom recurring prompt you want outside the weekly rhythm. `operator-schedule-tick` runs every minute, dispatches due rows.

## Schema additions

- `tasks.depth int default 0` — chain depth guard.
- `tasks.kind text` — `'plan_item' | 'standup' | 'ad_hoc'` (for filtering).
- `threads.kind text default 'solo'` — `'board' | 'standup' | 'recap' | 'solo'`.
- `approvals.kind text default 'task'` — `'weekly_plan' | 'task'`.
- `suggestions` table: id, agent_slug, thread_id, title, body, status (`open|approved|dismissed`), created_at.
- `schedules` table (as before).

## Files

**Add**
- `src/routes/api/public/inngest.ts` — Inngest serve endpoint.
- `src/server/inngest.server.ts` — client + functions (`monday-board`, `daily-agent-reports`, `weekly-recap`, `task-runner`, `approval-overdue-watcher`, `tool-call-failed`, `operator-schedule-tick`).
- `src/server/inngest-events.server.ts` — gateway POST helper.
- `src/serverfns/tasks.functions.ts` — `runTask`, `approveWeeklyPlan`.
- `src/serverfns/suggestions.functions.ts` — list / decide.
- `src/serverfns/schedules.functions.ts` — CRUD.
- `src/components/WeeklyPlanPanel.tsx` — Monday review/approve UI.
- `src/components/DailySuggestions.tsx` — today's items strip.
- `src/components/SchedulesPanel.tsx` — operator schedules.

**Edit**
- `src/serverfns/terminal.functions.ts` — `dispatch()` writes parent approval as `kind:'weekly_plan'` for board mode; on weekly approval, fan-out emits `agent/task.ready`.
- `src/components/Terminal.tsx` — mount `WeeklyPlanPanel` + `DailySuggestions` above command bar; show router trace + auto-route toggle.
- `src/lib/agent-schemas.ts` — add `weekly_plan` artifact hint.

## Out of scope

- Auto-approving external actions (email/etc still gated).
- Streaming agent responses.
- Multi-tenant scheduling.

## Setup before code

Connect the **Inngest connector** (provides `LOVABLE_API_KEY`, `INNGEST_API_KEY`, `INNGEST_SIGNING_KEY` automatically). Nothing else to add.
