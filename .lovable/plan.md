
## Goal

Keep all current VDNX content (the VDNX board/scenario and the VDNX Forge agent types / base models) exactly as it is today, but make it **system-owned and invisible to regular users**. Signed-in users get an empty workspace where they can create **their own boards and their own models** from scratch.

Also fix the navigation 404 (`/_authenticated/chat` → 404) at the same time.

---

## 1. Ownership model

Introduce a single notion of ownership on every user-creatable row:

- `owner_id uuid` → `auth.users(id)` when the row belongs to a user.
- `is_system boolean default false` → `true` for the seeded VDNX rows.
- `owner_id` is `NULL` exactly when `is_system = true`.

Applies to:

- `budget_scenarios` (boards)
- `agent_types` (custom agent definitions)
- `base_models` (custom model registrations)
- `trainings`, `deployments` (already per-user; just confirm RLS)

Add a tiny admin concept so VDNX itself can still be managed:

- `app_role` enum `('admin','user')`
- `user_roles(user_id, role)` + `has_role(uid, role)` security-definer function (per project standard).
- Mark one designated VDNX operator email as `admin` via a one-row insert.

### Visibility rules (RLS)

For each of the three tables (`budget_scenarios`, `agent_types`, `base_models`):

- **SELECT**: `owner_id = auth.uid() OR (is_system AND has_role(auth.uid(),'admin'))`
- **INSERT**: `owner_id = auth.uid() AND is_system = false`
- **UPDATE/DELETE**: `owner_id = auth.uid()` (admins can additionally manage system rows)

Net effect:
- Regular user signs in → sees **only their own** boards and models. No VDNX rows leak.
- Admin signs in → sees their own rows **plus** the VDNX system rows.
- Nobody can mutate system rows except admins.

### Backfill

- Seeded VDNX `agent_types` / `base_models` → set `is_system = true`, `owner_id = null`.
- Any existing scenario rows considered "the VDNX board" → same treatment (or leave none if there are none yet).

---

## 2. Blank-start UX

Per your choice, new users do **not** get a clone of VDNX. They get:

- **Budget**: empty list + a primary "New board" button → creates an empty `budget_scenarios` row owned by them, opens the editor.
- **Forge**: empty Agent Types + Base Models lists, each with a "New …" form. Submission inserts a row with `owner_id = auth.uid()`.

The Hub tiles stay the same; counts ("0 boards", "0 models") reflect the user's own data only.

---

## 3. Fix the `/_authenticated/chat` 404

Root cause: `ModuleSwitcher` links to `/_authenticated/chat`, `/_authenticated/terminal`, etc. Those are TanStack **route IDs**, not URLs — the real URLs are `/chat`, `/terminal`, `/budget`, `/forge`.

Fix: in `src/components/ModuleSwitcher.tsx`, change every `to: "/_authenticated/<x>"` to `to: "/<x>"`, and update the `path.startsWith(...)` active-state checks accordingly. No route files change.

---

## 4. Files touched

- **Migration** (one file): add `app_role`, `user_roles`, `has_role`; add `owner_id` + `is_system` columns on `budget_scenarios`, `agent_types`, `base_models`; backfill seeds to system; replace existing RLS policies on those three tables with the visibility rules above; insert one admin row for the VDNX operator email (you'll confirm the email on approval).
- **Edit** `src/components/ModuleSwitcher.tsx` — fix the 4 link targets + active checks.
- **Edit** `src/routes/_authenticated/forge.tsx` — drop `.eq("is_seed", true)`; query by RLS visibility (the policy already filters). Add minimal "New agent type" and "New base model" forms.
- **Edit** `src/routes/_authenticated/budget.tsx` — render the user's own scenarios list + "New board" button (still a thin shell; the full engine port stays as the previously-planned Wave 2).
- No changes to chat/terminal data or VDNX content.

---

## 5. Out of scope (this wave)

- Full Budget engine port and full Forge training UI — still queued for Wave 2.
- Multi-org / team sharing.
- Admin UI to manage VDNX system rows (admins use SQL / Supabase Studio for now).
- Cloning a system row into a user-owned row (can add later as a one-click "Start from VDNX" button if you want it).

---

## What I need from you on approval

1. The **email address** that should be granted the `admin` role (so admins can still see/manage VDNX). Reply with it on approval, or say "skip — I'll grant it manually later" and I'll leave the `user_roles` table empty.
