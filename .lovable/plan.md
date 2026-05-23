## Plan: Install "VDNX Unicorn Execution Mode v2" as the universal base prompt

Every agent in this app already loads `DEFAULT_COMPANY_CONTEXT` at the top of its system prompt via `buildSystemPrompt()` in `src/lib/agent-prompts.ts` (CEO, CFO, COO, CTO, CMO, CCO, sales, linkedin, social, seo, router, and consult/boardroom mode). It's also used by the daily-standup cron. Replacing this one constant cascades the v2 directive into every agent without touching individual role prompts.

### Changes

**`src/lib/agent-prompts.ts`**
1. Replace `DEFAULT_COMPANY_CONTEXT` (lines 5–18) with the full v2 directive, condensed to keep token cost reasonable but preserving all 15 sections + final directive verbatim in spirit (Core Objective, Non-Negotiable Rule, Strategic Positioning, Execution Standard, Thinking Model, Growth Lens, Market Strategy, Communication Style, Output Discipline, Authority Protocol, Product Philosophy, Category Creation, Engineering Truths, Build vs Adopt, Final Filter, Final Directive).
2. Extend `renderCompanyContext()` so that even when a custom company-context row exists in the DB, the v2 directive is appended as the universal execution standard (custom mission/ICP/etc. layer on top, never replace the directive).
3. Keep `COMPANY_CONTEXT` export pointing at the new value (back-compat).

### Why this is the right surface

- `buildSystemPrompt()` already prepends `companyContext ?? DEFAULT_COMPANY_CONTEXT` to every agent's identity, including consult/boardroom seats.
- `buildRouterPrompt()` also takes `companyContext` as input — the router will inherit the directive too.
- `loadContext()` (in `src/server/cadence.server.ts`) pulls `companyContext` from the DB row and falls back to `DEFAULT_COMPANY_CONTEXT`. Updating `renderCompanyContext()` to always append the v2 directive guarantees it applies even when the operator has set custom company context.

### Out of scope

- No changes to role-specific deliverable schemas (`ROLES[...]`), tool contracts (`agent-schemas.ts`), or output enforcement.
- No DB migration — the directive lives in code so it can't be edited away accidentally.
- No UI changes.

### Verification

- Confirm typecheck passes.
- Spot-check one CEO chat turn and one boardroom dispatch in preview to confirm the new directive is at the top of the system prompt (visible via outputs' tone/structure; no behavior should regress because output tool contracts are unchanged).
