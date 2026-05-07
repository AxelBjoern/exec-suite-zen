## Goal

Right now the terminal only exposes commands via `/help` text. Users have to memorize agent slugs and verbs. We'll add a **Command Library** — a browsable, searchable catalog of every command, plus a Ctrl+K palette so any command is one keystroke away.

## What gets added

### 1. Central command catalog (`src/lib/command-library.ts`)
A single source of truth, organized into four categories:

- **System** — `/help`, `/clear`, `/agents`, `/tasks`, `/approvals`, `/audit`, `/leads`, `/manual`, `/verify`, `/directive <agent> <text>`
- **Agent verbs** (per agent, 10 agents × ~5 verbs):
  - CEO: `brief`, `decide`, `memo`, `review`, `prioritize`
  - CFO: `brief` (burn/runway), `model`, `forecast`, `variance`, `board-pack`
  - COO: `sop`, `runbook`, `incident`, `okr`, `status`
  - CTO: `architect`, `rfc`, `postmortem`, `roadmap`, `review-pr`
  - CMO: `campaign`, `positioning`, `launch`, `narrative`, `calendar`
  - CCO: `policy`, `kyc-review`, `risk-memo`, `audit-prep`, `disclosure`
  - Sales: `outbound`, `proposal`, `pipeline`, `discovery`, `close-plan`
  - LinkedIn: `post`, `comment-strategy`, `dm-sequence`, `profile-audit`
  - Social: `thread`, `caption`, `calendar`, `trend-brief`
  - SEO: `keyword-map`, `brief`, `audit`, `backlink-plan`
- **Boardroom** — `:board <agent> <verb>` with example consults
- **Shortcuts** — Ctrl+K (palette), ↑/↓ (history), Tab (autocomplete), Esc (clear input)

Each entry: `{ id, category, syntax, summary, example, requiresAgent?, requiresArgs? }`.

### 2. Library panel (`/library` command + roster button)
A new `Panel` kind `library` rendered as a 2-column reading view:
- Left rail: category filters (System / Agent verbs / Boardroom / Shortcuts) + per-agent filter chips.
- Right: searchable list. Each row shows syntax in mono, summary, and a "Run" button that prefills the command line (or executes if it has no required args).
- Sticky search box at top (`/` focuses it, like GitHub).

Also expose it from:
- The Roster sidebar (footer button next to "Manual v3.1")
- `/help` output (link line: "type /library for the full catalog")

### 3. Ctrl+K command palette
A modal (cmdk-style, built with existing `Dialog` + simple filter — no new deps) that:
- Opens on `Ctrl/Cmd+K` from anywhere in the terminal.
- Fuzzy-filters the same catalog by syntax + summary + agent role.
- Enter → if command is complete, execute via `exec()`; if it needs args, prefill input and close.
- ↑/↓ to navigate, Esc to close.

### 4. Inline autocomplete (small, scoped)
When the input starts with `:` or `/`, show a thin dropdown above the command line listing matching catalog entries (max 6). Tab accepts top suggestion. This reuses the catalog so suggestions stay in sync.

## Files touched

- **new** `src/lib/command-library.ts` — catalog + types + helpers (`searchCommands`, `commandsForAgent`).
- **new** `src/components/CommandPalette.tsx` — Ctrl+K modal.
- **new** `src/components/LibraryPanel.tsx` — full-page library view.
- **edit** `src/components/Terminal.tsx`:
  - Add `library` to `Panel` union, route it in tab content + `panelLabel`.
  - Add `/library` to `exec()`.
  - Mount `<CommandPalette />`, wire global Ctrl+K listener.
  - Add small autocomplete dropdown above the input (uses catalog).
  - Add Roster footer button "Command Library".
  - Update `HELP` string to mention `/library` and Ctrl+K.

No backend / schema changes. No new dependencies.

## Out of scope

- No changes to dispatch logic, agents, audit, or approvals.
- No editing of catalog from the UI (it's code-defined for now; can move to DB later).
- No fix to the SSR clock hydration warning (separate issue).
