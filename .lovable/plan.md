## Goal
Rename `/forge` → `/agents-models` with title "Agents & Models". Seed the 10 terminal agents and add Gemini 2.5 Flash. Show system content only to admin (axel) and expose DeepSeek V4 Flash + Gemini 2.5 Flash as public defaults visible to every user.

## Changes

### 1. Route rename
- New file `src/routes/_authenticated/agents-models.tsx` — copy of current forge with updated heading ("Agents & Models"), title meta, and query keys (`["am", ...]`).
- Delete `src/routes/_authenticated/forge.tsx`.
- Add `src/routes/_authenticated/forge.tsx` shim that redirects to `/agents-models` (preserves existing links).
- Update `src/components/ModuleSwitcher.tsx`: `{ to: "/agents-models", label: "Agents & Models", icon: Cpu }`.
- Update `src/routes/_authenticated/index.tsx`: card link `to: "/agents-models"`, label "Agents & Models"; update description meta.
- Update `README.md` references from Forge → Agents & Models.

### 2. Schema migration (`is_public` flag for non-admin visibility)
- `ALTER TABLE base_models ADD COLUMN is_public boolean NOT NULL DEFAULT false;`
- `ALTER TABLE agent_types ADD COLUMN is_public boolean NOT NULL DEFAULT false;`
- Replace the `select` policies on both tables so rows are visible when `owner_id = auth.uid()` OR `is_public` OR `(is_system AND has_role(auth.uid(),'admin'))`. Other policies unchanged.

### 3. Data seed (via insert tool)
- Insert 10 system `agent_types` matching terminal IDs: ceo, cfo, coo, cto, cmo, cco, sales, linkedin, social, seo (industry = executive/revenue/marketing/etc., short description from `agent-prompts.ts`), `is_system=true`, `is_public=false` — visible only to axel (alongside the 20 existing executives).
- Insert system `base_model` row `google/gemini-2.5-flash` (provider `openrouter`, name "Gemini 2.5 Flash"), `is_system=true`, `is_public=true`.
- Update existing `deepseek/deepseek-v4-flash` row to `is_public=true`.

### 4. UI tweaks
- In Agents & Models page, badge label shows "VDNX" for `is_system` rows and "Default" for `is_public && !is_system` rows.
- Empty-state copy: "No custom agents yet — VDNX defaults are read-only."

## Notes on memory rule
The project memory restricts code to 8 OpenRouter models. Per your instruction we are adding `google/gemini-2.5-flash` as an exception for the Agents & Models catalog only. I will update `mem://index.md` Core to note "Gemini 2.5 Flash is permitted as a default user-selectable model in Agents & Models" so future sessions don't strip it. LLM calls in `src/server/llm.server.ts` are unchanged.

## Out of scope
- No changes to terminal routing logic or `llm.server.ts` model dispatch.
- No new RLS for write paths (owners still write their own; admin still manages system rows).