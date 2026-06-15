## Problem

Clicking **Run now** on `/automate` shows a "Run started" toast, but the run stays `pending` forever and the UI never updates.

Root causes:
1. `runWorkflowNow` only inserts a `job_queue` row with `kind="workflow_step"`. Actual execution depends on `/api/public/cron/job-tick`, which is not scheduled yet — so nothing ever picks the job up.
2. The currently-pending run (`dab7442d-…`) failed 3× against the **published** worker with `unknown job kind: workflow_step` (the published deployment predates the `workflow_step` branch we added to `job-tick.ts`). New preview runs would also stall because the cron isn't wired.
3. No UI signal when a run is stuck pending — the toast says "Run started" and that's it.

---

## How Automate works (mental model)

```text
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  /automate UI   │───▶│ workflows table  │    │ schedules table  │
│  (builder)      │    │  (nodes JSON)    │    │ (cron string)    │
└────────┬────────┘    └──────────────────┘    └────────┬─────────┘
         │ Run now                                       │ Activate
         ▼                                               ▼
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ runWorkflowNow  │───▶│ workflow_runs    │◀───│  pg_cron tick    │
│ (server fn)     │    │  status=pending  │    │  (every minute)  │
└────────┬────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                      │                       │
         ▼                      ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   job_queue (kind=workflow_step)                 │
│                                                                  │
│           pulled by /api/public/cron/job-tick (1/min)            │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
              ┌──────────────────────────────┐
              │ runWorkflowStep(run, idx)    │
              │                              │
              │ trigger     → log + advance  │
              │ llm_step    → OpenRouter     │
              │ human_review→ approvals row, │
              │               PARK run       │
              │ action      → audit_log      │
              │ output      → decision_log   │
              │                              │
              │ enqueues next node           │
              └──────────────────────────────┘
```

Key invariants:
- A run advances **one node per cron tick**. A 5-node workflow needs ~5 minutes end-to-end (or you run nodes inline — see fix below).
- `human_review` nodes **park** the run (`status=awaiting_approval`) until someone hits Approve/Reject in `/approvals`, which calls `decideRunApproval` and re-queues the next node.
- "Activate" creates a `schedules` row with `agent_slug='workflow-runner'` + cron string. That row is for **scheduled** triggers (e.g. daily 9am). It does not affect manual "Run now".

---

## Fix

### 1. Execute the first step inline in `runWorkflowNow`
In `src/lib/workflows.functions.ts`, after inserting `workflow_runs`, call `runWorkflowStep({ run_id, node_index: 0 })` directly via `await import("@/server/workflow-runner.server")` instead of relying on cron. The runner still enqueues subsequent steps into `job_queue`, so multi-node workflows continue advancing on the cron tick — but the user sees node 0 (and any synchronous chain up to the first `human_review`) execute immediately and the toast can say "Run executing".

Wrap in try/catch: on failure, mark the run `failed` and surface the message to the client.

### 2. Same pattern for `decideRunApproval`
After approval, also run the next step inline so approving doesn't leave the run stuck for up to a minute.

### 3. Schedule `pg_cron` to call `/api/public/cron/job-tick`
Add a migration that schedules `job-tick` every minute via `pg_net` + the project's anon key. This is what makes multi-step workflows and scheduled (activated) workflows actually progress.

```sql
select cron.schedule(
  'workflow-job-tick',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://exec-suite-zen.lovable.app/api/public/cron/job-tick',
       headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
```

(Same for the existing `scheduled-outbound`, `daily-reports`, etc. crons if not already scheduled — check `select * from cron.job` first to avoid duplicates.)

### 4. UI feedback on `/automate`
- After `run.mutate()` succeeds, invalidate `["workflow-runs", activeId]` so `RunHistory` refetches immediately.
- Show server error message in the toast on failure (already does, just verify).
- Optional: show the run status badge (`pending` / `running` / `awaiting_approval` / `completed` / `failed`) inline next to each run in `RunHistory`.

### 5. Clean up the stuck run
Mark `dab7442d-…` as `failed` so it doesn't linger in the UI.

---

## Step-by-step: getting a workflow running end-to-end

After the fixes above, here's the user flow that will work:

1. **Open `/automate`** → click a template (e.g. "Daily LinkedIn Brief") or **+ New workflow**.
2. **Name it** in the top input.
3. **Add nodes** from the toolbar — typical chain: `trigger` → `llm_step` → `human_review` → `action` → `output`.
4. **Configure each node**:
   - `llm_step`: set `prompt` and `model` (must be one of the 8 allowed models — Grok 4.3 is the default).
   - `human_review`: set a `label` describing what's being approved.
   - `action`: set `action` slug (recorded to `audit_log`).
   - `output`: set `summary`.
5. **Click Save** → the workflow is persisted to `workflows`.
6. **Click Run now** → with the fix, node 0 executes inline. Watch the right-hand **Run history** panel:
   - `running` → currently executing a node.
   - `awaiting_approval` → parked. Go to `/approvals`, find the row tagged with the workflow name, click Approve → run resumes on next inline step.
   - `completed` / `failed` → terminal. Click a run to see the `log` array with per-node messages.
7. **(Optional) Schedule it**: click **Activate** → creates a `schedules` row with cron `0 9 * * *` (daily 9am by default). The pg_cron tick will pick this up and create runs automatically.

Smoke test recipe:
- Build a 2-node workflow: `trigger` → `output` with summary "hello".
- Save, Run now → should go straight to `completed`, with one entry per node in the log and a row in `decision_log`.
- Add an `llm_step` in the middle with prompt "say hi" → Run now → run advances through LLM call (verify OpenRouter call in `server-function-logs`) and completes.
- Add a `human_review` after the llm_step → Run now → run parks at `awaiting_approval`, an `approvals` row appears in `/approvals` → approve → run completes.

---

## Files to edit

- `src/lib/workflows.functions.ts` — inline first-step execution in `runWorkflowNow` and `decideRunApproval`.
- `src/routes/_authenticated/automate.tsx` — scope query invalidation to `activeId`.
- New migration — schedule `pg_cron` job calling `/api/public/cron/job-tick` every minute, and mark the stuck run failed.

No schema changes (besides the cron registration), no new deps.

## Out of scope

- Replacing the cron-driven job queue with a different runtime (much bigger change). Cron stays for scheduled runs and for advancing multi-step runs that span LLM calls.
- Real-time status streaming in the UI (would need realtime subscriptions on `workflow_runs`).
