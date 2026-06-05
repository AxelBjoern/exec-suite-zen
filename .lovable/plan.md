
## Goal

Turn this project into a multi-module workspace:

```text
                ┌─ /chat       (current Veridian chat)
   /auth ──►    ├─ /terminal   (current Veridian terminal)
   (gate)       ├─ /budget/*   (from Budget Dashboard Buddy)
                └─ /forge/*    (from AI Forge)
                  ▲
                  └─ /  =  neutral hub (4 module cards + user menu)
```

All modules share the dark/gold VDNX theme, one Supabase, one auth, one router.

---

## 1. Auth + neutral start

- Add Supabase auth: email/password + Google (via `lovable.auth.signInWithOAuth("google")`, plus `configure_social_auth`).
- New routes (top-level, public):
  - `/auth` — sign-in / sign-up tabs, neutral VDNX-styled card.
  - `/reset-password` — password recovery.
- New pathless layout `src/routes/_authenticated/route.tsx` (`ssr: false`, `beforeLoad` → `supabase.auth.getUser()`, redirect to `/auth`).
- Move existing app routes under the gate:
  - `src/routes/index.tsx`     → `src/routes/_authenticated/chat.tsx`
  - `src/routes/terminal.tsx`  → `src/routes/_authenticated/terminal.tsx`
- New `src/routes/_authenticated/index.tsx` = **neutral hub** at `/`:
  - VDNX dark + gold, app logo, user email, sign-out.
  - Four big tiles → **Chat**, **Terminal**, **Budget**, **Forge** (each with one-line description + status pill).
- Shared top bar `<ModuleSwitcher>` shown on every authenticated route (Chat · Terminal · Budget · Forge · Hub · avatar).

---

## 2. Budget module (full code + DB merge)

Copy from `Budget Dashboard Buddy` and re-skin to VDNX tokens.

**Routes** (under `/_authenticated/budget/`):
`index` (overview) · `board` · `budget` · `monthly` · `statements` · `compare` · `scenarios` · `sensitivity` · `financing` · `results` · `changelog`.

**Code**: copy `src/components/budget/*` and `src/lib/budget/*` (engine, financing, sensitivity, exports, format, seed, types). Budget's `Topbar` is replaced by the shared `<ModuleSwitcher>`.

**DB migration** — Budget had zero migrations (zustand + localStorage). Persist properly per-user:

```sql
create table public.budget_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  assumptions jsonb not null,
  actuals jsonb not null default '{"rows":[]}'::jsonb,
  contract_start_date date,
  is_base boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.budget_audit (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid references public.budget_scenarios(id) on delete set null,
  field text, summary text,
  created_at timestamptz not null default now()
);
-- + grants + RLS scoped to auth.uid()
```

Server fns in `src/serverfns/budget.functions.ts`: `listScenarios`, `upsertScenario`, `deleteScenario`, `setBase`, `toggleLock`, `setActual`, `clearActuals`, `appendAudit`. Zustand store keeps client cache; persistence layer swapped to React Query + server fns (seed scenario auto-created on first visit).

---

## 3. AI Forge merge (full feature parity)

Copy from `AI Forge` and re-skin.

**Routes** (under `/_authenticated/forge/`):
`dashboard` · `agent-types` · `base-models` · `models` · `deployments` · `training.new` · `settings`.

**Components**: `app-sidebar.tsx`, `top-bar.tsx` (kept as forge-internal sub-nav inside the module).

**DB migration**: port AI Forge's tables verbatim — `profiles`, `agent_types`, `base_models`, `trainings`, `deployments`, `user_secrets` — including the `handle_new_user` trigger, all RLS, and the 20 seed agent types + 6 seed base models. (`profiles` is reused for the whole app.)

**Storage**: create `colab-notebooks` bucket (public read, per-user folder write).

**Server fns**: copy `agent-types.functions.ts`, `trainings.functions.ts`, `training-ai.functions.ts`, `colab.functions.ts`, `secrets.functions.ts`. Rewrite any LLM/model selection to go through `src/server/llm.server.ts` (OpenRouter) — only the 8 allowed models. Drop Fireworks-specific endpoints; replace with OpenRouter-backed deploy stub that records `endpoint_url = OpenRouter model id`. `user_secrets.fireworks_api_key` repurposed as generic `provider_api_key` (column rename in migration).

---

## 4. Theme + shell unification

- All copied components stripped of project-specific colors, switched to VDNX tokens (`bg-background`, `text-foreground`, `text-primary` gold, etc.) from `src/styles.css`.
- Each module's internal nav uses VDNX pill style already established in Terminal/Chat headers.
- `<ModuleSwitcher>` component lives in `src/components/ModuleSwitcher.tsx`, rendered by `_authenticated/route.tsx`.

---

## 5. Out of scope

- No data migration of existing `agents/threads/messages/...` tables — they remain as the Chat/Terminal backend.
- No multi-tenant org model — single user owns their budget scenarios and forge trainings.
- No Fireworks training pipeline; Forge's "Train" button creates a `trainings` row + Colab notebook only, deploy uses OpenRouter.
- Existing email/cron/research server fns untouched.

---

## Technical notes

- Migration order (single migration): profiles + trigger → agent_types → base_models → trainings → deployments → user_secrets → budget_scenarios → budget_audit → storage bucket + policies → seeds.
- `configure_social_auth(["google"])` called in same turn as Google button.
- Existing `index.tsx` / `terminal.tsx` moved (not duplicated) to avoid double `/` route conflict.
- `attachSupabaseAuth` already wired in `src/start.ts` — verify after edits.
- Existing serverfns that currently run unauthenticated (`dispatch`, `routePrompt`, etc.) gain `requireSupabaseAuth` middleware so chat/terminal data becomes per-user (acceptable since you're now behind auth). If you'd rather keep them shared/global for now, say so and I'll skip this part.

---

## Files (high level)

- new: `src/routes/auth.tsx`, `reset-password.tsx`, `_authenticated/route.tsx`, `_authenticated/index.tsx`, `_authenticated/chat.tsx`, `_authenticated/terminal.tsx`, `_authenticated/budget/*` (11 files), `_authenticated/forge/*` (7 files)
- new: `src/components/ModuleSwitcher.tsx`, `src/components/budget/*` (6 files copied + reskinned), `src/components/forge/{app-sidebar,top-bar}.tsx`
- new: `src/lib/budget/*` (8 files), `src/serverfns/budget.functions.ts`, `src/serverfns/forge/*.ts` (5 files)
- migration: one big SQL file (Forge schema + Budget schema + seeds + storage)
- delete: `src/routes/index.tsx`, `src/routes/terminal.tsx` (replaced by moved versions)
