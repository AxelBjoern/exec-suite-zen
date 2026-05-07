
# Autonomous Agents — Phase 4

Goal: agents stop being purely reactive. Internal action items execute themselves, and recurring/event-driven jobs fire agents on a schedule.

## 1. Auto-execute action items (the agent chain)

Today: `dispatch()` produces an artifact with `action_items[]`. Items with `auto_dispatch=true && !shouldGate(...)` are inserted as `tasks` rows with `status="todo"` — but nothing runs them.

Change: introduce a **task runner** that picks up internal todo tasks and dispatches them through the owning agent as freeform prompts.

- New server fn `runTask({ task_id })` in `terminal.functions.ts`:
  - Loads task → builds a freeform prompt from `title + body`.
  - Calls existing `dispatch({ agent_slug: owner_agent, freeform: true, prompt, parent_task_id, thread_id })`.
  - Marks task `running` → `done` (or `blocked` on error). Logs `tool_call` for traceability.
- After `dispatch()` finishes creating internal child tasks, enqueue an Inngest event `agent/task.ready` per child instead of leaving them as static todos. The Inngest function calls `runTask`. This gives durable retries and avoids long synchronous chains in one HTTP request.
- Depth guard: refuse to chain past `max_depth = 3` (stored on task as `depth` int column) to prevent runaway loops.
- External / approval-gated tasks remain blocked until operator approves — runner ignores them.

UI: `Terminal.tsx` shows a small "auto-running N child tasks" trace; `LibraryPanel` / tasks list gets a status pill (todo/running/done/blocked) and a manual "Run now" button.

## 2. Auto-route default

Already implemented for the terminal. Confirm + polish:
- Show the `RouteDecision` (primary + consults + inferred verb) as a one-line trace above the agent reply.
- Add a small toggle "Auto-route" (default ON) in Terminal header so operator can disable if they want strict `:agent verb` mode.

## 3. Inngest scheduler + watchers

Use the **Inngest** connector (durable, retryable, event-driven). One serve endpoint hosts every function.

### Setup
- Connect Inngest via `standard_connectors--connect` (`inngest`).
- New server route `src/routes/api/public/inngest.ts` exposing `serve({ client, functions })` — handles GET/POST/PUT.
- Operator must hit the URL once to sync (we'll surface a "Sync Inngest" button in the UI that opens the endpoint).

### Built-in functions

1. **`daily-standup`** — cron `0 8 * * *`
   - Fans out to COO (`:coo daily_ops`) and CFO (`:cfo cash_pulse` if defined, else freeform "give a 1-paragraph cash pulse").
   - Posts artifacts to a dedicated thread tagged `kind=standup` (new optional `threads.kind` column).

2. **`weekly-ceo-review`** — cron `0 9 * * 1` (Mon 9am)
   - Runs `:ceo strategy weekly review` boardroom-style with consults from CFO/COO.

3. **`task-runner`** — event `agent/task.ready`
   - Calls `runTask({ task_id })` (above). Retries on failure.

4. **Watcher `approval-blocked-watcher`** — event `agent/approval.created` or cron `*/15 * * * *` poll
   - For approvals pending > 24h, sends a freeform prompt to the owner agent: "Your approval is overdue, draft a follow-up summary." (Notification only — does not auto-approve.)

5. **Watcher `tool-call-failed`** — event `agent/tool_call.failed`
   - Routes the failure to the owner agent for a freeform "diagnose and propose fix" reply.

Events are emitted from inside `dispatch()` / `decideApproval()` / the Resend block via the documented gateway POST `https://connector-gateway.lovable.dev/inngest/e/`.

### Operator-defined schedules

New table `schedules`:
```
id uuid pk
name text
cron text                -- e.g. "0 9 * * *"
agent_slug text
mode text                -- 'verb' | 'prompt' | 'boardroom'
verb text null
args text null
prompt text null
active bool default true
last_run_at timestamptz null
created_at timestamptz default now()
```

A single Inngest function `operator-schedule-tick` runs every minute, queries due active schedules, dispatches them, updates `last_run_at`. (We don't dynamically register cron functions — one tick handler covers all custom schedules.)

UI: new `SchedulesPanel` (sidebar tab) with a list + "Add schedule" form (name, cron, agent picker, mode + verb/prompt). Inline next-run preview using a small cron parser (`cronstrue` for human text, `cron-parser` for next date — both pure JS, Worker-safe).

## 4. Files to add / change

Add:
- `supabase/migrations/<ts>_autonomy.sql` — `schedules` table (RLS open to match project pattern), `tasks.depth int default 0`, optional `threads.kind text`.
- `src/routes/api/public/inngest.ts` — Inngest serve endpoint.
- `src/server/inngest.server.ts` — Inngest client + function definitions (daily-standup, weekly-ceo-review, task-runner, watchers, operator-schedule-tick).
- `src/server/inngest-events.server.ts` — typed `sendEvent(name, data)` helper using gateway URL.
- `src/serverfns/schedules.functions.ts` — list/create/toggle/delete schedules.
- `src/serverfns/tasks.functions.ts` — `runTask`, `listRunnableTasks`, manual-run endpoint.
- `src/components/SchedulesPanel.tsx` — UI for schedules.

Edit:
- `src/serverfns/terminal.functions.ts` — emit `agent/task.ready` after creating internal child tasks; emit `agent/tool_call.failed` on Resend errors; expose `runTask`.
- `src/components/Terminal.tsx` — auto-route toggle + router trace line.
- `src/components/LibraryPanel.tsx` (or wherever tasks render) — status pill + "Run now".
- `src/lib/agent-schemas.ts` — add `depth` to ActionItem (optional, for telemetry only).

## 5. Secrets / connectors

- Inngest connector — user clicks Connect (provides `LOVABLE_API_KEY`, `INNGEST_API_KEY`, `INNGEST_SIGNING_KEY` automatically).
- After deploy, operator clicks "Sync Inngest" button (opens the serve URL) so Inngest registers functions.

## 6. Out of scope

- Auto-approving external actions (emails to real recipients still gated).
- Streaming partial agent output.
- Multi-tenant scheduling (single workspace assumed).

## Technical notes

- Depth guard prevents agent A → B → A → B loops; tasks deeper than `max_depth` are marked `blocked` with reason `"max chain depth"`.
- Operator-defined schedules use minute-tick polling instead of dynamic Inngest cron registration to keep things simple and editable from the UI.
- All cron/Inngest endpoints live under `/api/public/*` so they bypass auth on published deployments; Inngest verifies signatures via `INNGEST_SIGNING_KEY` automatically.
