## VDNX Operations Terminal

A Bloomberg-grade command terminal where you operate the AI executive team via keystrokes. Built per **VDNX Agent Instruction Manual v3.1** — every action reinforces **Authority · Auditability · Atomicity**.

### The shift: Hub → Terminal
The interface is no longer a click-driven dashboard. It is a **keyboard-first terminal**: a persistent command line at the bottom of the screen, dense data panels above, monospace ledger feeds, and instant agent dispatch through typed commands. Mouse works, but a power user never has to leave the keyboard.

### Terminal command grammar
```
:<agent> <verb> [args]            → dispatch to one agent
:board <verb> [args]              → boardroom (primary + auto consults)
/help                              → list commands
/agents                            → roster
/manual                            → instruction manual
/tasks [filter]                    → task inbox
/approvals                         → pending approval queue
/audit [filter]                    → audit log stream
/leads [filter]                    → lead gen pipeline
/directive <agent> <text>          → pin a standing directive
/template <agent> <name>           → run a templated brief (Weekly Report, OKRs, Board Deck, Content Calendar…)
/clear /focus /split               → terminal layout controls
↑ ↓                                → command history
Tab                                → autocomplete agents, verbs, templates
Ctrl+K                             → command palette (fuzzy)
Ctrl+1..0                          → jump to agent panel
```

Examples:
- `:cfo brief FY26 burn scenarios base/best/worst`
- `:board approve Q3 GTM plan`
- `:social draft thought-leadership post on hash-chained audit trails`
- `/template ceo board-deck Q3`
- `/directive sales target ADGM-licensed funds only`

Unknown commands are rejected with a hint — never silently guessed.

### Terminal layout
```
┌──────────────────────────────────────────────────────────────────────────┐
│ VDNX TERMINAL · AUTHORITY · AUDITABILITY · ATOMICITY      [bell] [user] │
├────────────┬─────────────────────────────────────┬───────────────────────┤
│ ROSTER     │  ACTIVE PANEL (agent thread /       │  CONTEXT              │
│ CEO   ●    │  boardroom / tasks / audit / leads) │  - Mandate            │
│ CFO   ●    │                                     │  - Directives         │
│ COO   ○    │  Markdown rendered in serif         │  - Consult-with chips │
│ CTO   ●    │  body; code/data in mono            │  - Recent activity    │
│ CMO   ●    │                                     │                       │
│ CCO   ●    │                                     │                       │
│ SALES ●    │                                     │                       │
│ LEADGEN ●  │                                     │                       │
│ SOCIAL ●   │                                     │                       │
│ SEO   ●    │                                     │                       │
├────────────┴─────────────────────────────────────┴───────────────────────┤
│ AUDIT TICKER · 14:02 CFO task#812 completed · 14:01 CEO directive added │
├──────────────────────────────────────────────────────────────────────────┤
│ : _                                                          [⏎ dispatch]│
└──────────────────────────────────────────────────────────────────────────┘
```
- **Roster rail (left)**: 10 agents, status dot (idle / working / awaiting approval), unread count.
- **Active panel (center)**: tabbed; multiple agent threads open at once, drag to split-pane two side-by-side.
- **Context rail (right)**: live mandate, active directives, consult-with chips, recent activity.
- **Audit ticker**: bottom strip, scrolling append-only events (every directive, task, approval, message) — visual reinforcement of Auditability.
- **Command line**: persistent at the bottom, always focused unless typing in an open input.

### Foundational principles wired into the terminal
- **Authority** — outputs flagged "executive-facing" land in `/approvals`. Status stays `pending` until a human ✓. The command line shows `[REQUIRES APPROVAL]` before dispatch when relevant.
- **Auditability** — every command produces an `audit_log` row (actor, agent, verb, args, payload_hash, prev_hash, timestamp). The ticker streams it live; `/audit` opens the full log with filters.
- **Atomicity** — task execution is transactional: the task row, audit entry, notification, and (if applicable) approval row are written in one transaction or none at all.

### The executive team (10 agents — Manual v3.1)
Same roster as v3.1: CEO · CFO · COO · CTO · CMO · CCO · Head of Sales · LinkedIn Lead Gen Specialist · Social Media Marketing Expert (expanded) · SEO Expert. Each agent's system prompt = company overview + foundational principles + core values + universal Situation→Analysis→Options→Recommendation→Next Steps standard + role spec + active directives.

### Escalation matrix v3.1 (auto-applied by `:board`)
CEO → all C-level · CFO → CEO · COO → CEO · CTO → CEO, CCO · CMO → CEO · CCO → CEO, CTO, CFO · Sales → CEO, CMO, CCO · Social → CMO · LinkedIn → Sales, CMO. `:board <verb>` auto-loops the right consults; you can override with `:board+cfo+cco …`.

### Modes (panels you can open in the active area)
- **Agent thread** — solo conversation in the agent's voice.
- **Boardroom** — multi-agent sequential responses for one directive.
- **Tasks** — table; assign, monitor, approve, deep-link to thread.
- **Approvals** — queue of executive-facing outputs awaiting human ✓.
- **Audit** — append-only log, filter by agent / actor / type / time range.
- **Leads** — kanban (New → Contacted → Replied → Booked → Closed) + lead detail.
- **Manual** — Instruction Manual v3.1 rendered as an internal memo.

### LinkedIn Outreach & Lead Generation (commands)
- `/leads new` — open ICP builder
- `/leads enrich <url|csv>` — Firecrawl enrichment of public profile/company pages
- `/leads sequence <leadId>` — agent drafts 3–5 step institutional sequence
- `/leads triage <leadId>` — paste reply, classify + draft response
- `/leads brief` — daily morning brief task

### Visual direction — Terminal × private bank
- Near-black navy bg (`oklch` near `#070D1A`), ivory body, **muted gold** (committed/approved), **amber** (pending/preview), **red** (gate failure / rejection).
- **JetBrains Mono** for command line, ledger rows, hashes, ticker.
- **Playfair Display** for receipts, agent dossier headers, the Manual.
- **Inter** for chat body and forms.
- Hairline gold rules, small-caps section labels, dense data feel without losing editorial polish.
- Receipts and approval cards styled like notarised documents.

### Technical plan
- **Backend**: Lovable Cloud
  - `agents` — 10 seeded roles with full Manual v3.1 content + `consult_with[]`
  - `threads`, `messages`, `directives`
  - `tasks` — id, agent_id, thread_id, title, status, result, completed_at, requires_approval, approved_by, approved_at
  - `approvals` — id, task_id, status, reviewer, decided_at, notes
  - `audit_log` — append-only (actor, action, target, payload_hash, prev_hash, created_at), enforced via RLS (no update/delete)
  - `notifications`
  - `templates` — id, agent_id, name, prompt (Weekly Report, OKRs, Board Deck, Content Calendar…)
  - Lead Gen: `icps`, `leads`, `sequences`, `lead_replies`
- **Command parser** (client) — deterministic grammar, synonym map, autocomplete index. Unknown → reject with hint.
- **Server functions** (TanStack Start `createServerFn`):
  - `dispatch(command)` — resolves agent + verb, runs AI Gateway, writes message, creates task if needed, appends audit_log atomically.
  - `listAgents`, `getThread`, `pinDirective`, `runTemplate`, `approveTask`, `enrichLead`, `draftSequence`, `triageReply`, `verifyAudit(hash)` (read-only chain check).
- **Connectors**: Firecrawl for enrichment.
- **AI**: Lovable AI Gateway. `google/gemini-2.5-flash` default; `gemini-2.5-pro` for boardroom synthesis, board decks, long task execution. AI is strictly draft-layer — never marks a task `approved`.
- **Routing**: `/` terminal (single page; panels open inside it); `/manual`; `/verify/$hash` public read-only audit receipt; deep links like `/agent/$slug`, `/tasks/$id`, `/leads/$id` open the right panel inside the terminal.
- **Frontend**: TanStack Start, `cmdk` for command palette, `react-markdown`, `sonner` for toasts, keyboard shortcuts via custom hook.

### Build order
1. Enable Lovable Cloud, schema + seed 10 agents (Manual v3.1) + consult-with relationships.
2. Terminal shell: navy/gold/mono tokens, roster rail, active panel area, context rail, audit ticker, persistent command line.
3. Command parser + autocomplete + history + Ctrl+K palette.
4. `dispatch` server function → AI Gateway → message + audit_log (atomic).
5. Solo agent threads with Situation/Analysis/Options/Recommendation/Next Steps.
6. Directives + Templates (Weekly Report, OKRs, Board Deck, Content Calendar).
7. Tasks + Approvals queue + Audit log + Notifications (toast, bell, browser push).
8. Boardroom mode with auto-loaded consults.
9. Lead Gen panel: ICPs, Firecrawl enrichment, sequence composer, reply triage, kanban, daily brief.
10. Polish: split panes, gate-failure states, mobile fallback (command line collapses to single panel).
