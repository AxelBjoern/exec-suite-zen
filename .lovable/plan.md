# VDNX Agents — Make Them Actually Work (Phases 1 → 3)

Goal: agents stop chatting and start producing **structured, ready-to-execute artifacts**, with auto hand-offs, persistent company memory, and real external hands (LinkedIn, GitHub, email).

Phases ship in order. Each phase is independently useful.

---

## PHASE 1 — Structured deliverables + orchestration (ship first)

### 1.1 CEO Master Prompt (orchestrator)
CEO becomes orchestrator, not a doer. Every CEO reply uses:
- **Situation** (1 line)
- **Strategic Context** (tied to VDNX principles: Authority / Auditability / Atomicity)
- **Plan & Delegation** — `@Agent → exact task`
- **Final Decision / Recommendation**
- **Action Items** (table: # | Task | Owner | Deliverable | Due)
- **Next Steps**

Company context block injected into every agent prompt:
> VDNX is an institutional Company Operating System unifying governance, equity, ops, and compliance. Three principles: **Authority** (AI drafts, humans approve), **Auditability** (SHA-256 hash-chained), **Atomicity** (atomic ops, role-based security).

### 1.2 Role-specific output contracts (all 9 agents)

| Agent | Deliverable shape |
|---|---|
| **CMO** | Goal · Segments · Positioning · Channels+Budget · Timeline · KPIs · Assets · Action Items |
| **Social Media** | Objective · Platform Strategy · 7–30 day Calendar · 3–5 Sample Posts (full copy + hashtags + CTA) · Visual Brief · Amplification · Metrics · Action Items |
| **CTO** | Summary · Architecture · Trade-offs · Auditability/Atomicity Compliance · Phased Plan · Risks · Action Items |
| **CFO** | Exec Summary · Assumptions · Model · Base/Best/Worst · Capital Allocation · Risks · Action Items |
| **CCO** | Summary · Regulatory by Jurisdiction · Risk Rating · Controls · Approval Conditions · Action Items |
| **COO** | Objective · SOP/Runbook · Owners · SLAs · Risks · Action Items |
| **Head of Sales** | Opportunity · Value+Timeline · Buying Committee · Value Prop · Objections · Next Actions · Action Items |
| **LinkedIn Lead Gen** | ICP · Targeting · DM Sequence (full copy) · Connection Strategy · Tracking · Action Items |
| **SEO** | Keyword Map · Intent · Briefs · Technical Issues · Backlink Plan · Action Items |

### 1.3 Tool-calling instead of "please return JSON"
Switch `dispatch()` in `src/serverfns/terminal.functions.ts` to **structured tool-calling**. Each verb declares a JSON schema. Output guaranteed:
```json
{
  "title": "...",
  "sections": [{ "heading": "...", "body_md": "...", "table": {...}? }],
  "action_items": [
    { "task": "...", "owner_agent": "social", "deliverable": "...", "due": "...", "auto_dispatch": true }
  ],
  "requires_external_approval": false,
  "suggested_next_commands": [":social calendar ..."]
}
```

### 1.4 Action items become real work
Every `action_items[]` row → inserted into `tasks` with `parent_task_id` link. Shows in `/tasks`.

**Auto-dispatch rule:** internal verbs (`draft`, `outline`, `analyze`, `model`, `audit`, `review`) auto-dispatch to owner agent. External verbs (`post`, `publish`, `send`, `commit`, `email`, `announce`) queue in `/approvals`. Operator can override per item with "Run now" / "Hold".

### 1.5 Boardroom: real debate
1. Primary drafts structured proposal
2. Each consult returns `{ position: agree|disagree|amend, rationale, amendments[] }`
3. Primary issues final decision incorporating amendments
4. Logged as **one decision record** in `audit_log`

### 1.6 Artifact rendering
New `<ArtifactCard />`: collapsible card with title, sections (with tables), action-items list (badges: "auto-dispatched ✓" / "⏸ awaiting approval"), clickable suggested-next-command chips.

### Phase 1 files
- DB migration — `messages.artifact_json jsonb`, `tasks.parent_task_id uuid`, `tasks.owner_agent text`, `tasks.auto_dispatched bool`
- `src/lib/agent-prompts.ts` *(new)* — 9 role prompts + CEO orchestrator + company context
- `src/lib/agent-schemas.ts` *(new)* — per-verb JSON schemas
- `src/serverfns/terminal.functions.ts` — tool-calling, fan-out, new boardroom flow
- `src/components/ArtifactCard.tsx` *(new)*
- `src/components/Terminal.tsx` — render `ArtifactCard`, click-to-dispatch chips

---

## PHASE 2 — Persistent memory & context

Agents currently have zero memory. They give generic answers because they don't know the company or what was decided yesterday.

### 2.1 Company Context document
Single editable doc: mission, ICP, tone of voice, brand pillars, current quarter goals, no-go list. Prepended to every agent system prompt. Edited via `/context` (new panel).
- New table `company_context` (single row, versioned via `audit_log`)
- New panel in Terminal: markdown editor + "Save & re-broadcast"

### 2.2 Thread recall (short-term memory)
When continuing an existing thread, last N messages are summarized (one cheap AI call) into a `<prior_context>` block injected into the system prompt. Stops agents from repeating themselves and breaks the "every reply starts from scratch" feel.

### 2.3 Cross-agent decision recall (long-term memory)
When any agent runs, retrieve recent **structured decisions** from `audit_log` that match the topic (simple keyword match on `payload.title` + `agent_slug` filter). Inject as `<prior_decisions>` so CTO knows what CFO already opined on, etc.

### 2.4 Standing directives surfaced in UI
`directives` table already exists. Add a "Directives" tab inside `/agents` to view, add, toggle active, archive. Currently directives can only be pinned via command — no UI to manage them.

### 2.5 Templates & saved playbooks
`templates` table already exists. Add `/templates` panel: save any artifact as a reusable playbook (e.g. "Series-A board pack", "Launch week social calendar"). Run with `:cmo apply launch-week-template MENA Q1`.

### Phase 2 files
- DB migration — `company_context` table; `messages.summary text` (for thread recall cache)
- `src/serverfns/context.functions.ts` *(new)* — getContext / saveContext / summarizeThread / recallDecisions
- `src/components/ContextPanel.tsx` *(new)*
- `src/components/DirectivesTab.tsx` *(new, inside agents panel)*
- `src/components/TemplatesPanel.tsx` *(new)*
- `src/serverfns/terminal.functions.ts` — inject context + thread summary + prior decisions into every dispatch

**Outcome:** every agent reply is grounded in your company, your prior decisions, and your standing rules. No more generic chat.

---

## PHASE 3 — External hands (real execution) — IN PROGRESS

**Shipped now:**
- `:seo audit <url>` and `:sales research <url>` — live URL fetch + meta/H1/word-count snapshot, then auto-fed to the owning agent for analysis. Read-only, no approval.
- `:sales email <to> <subject>` and `:cmo announce <to> <subject>` — queues an email task with `payload.kind = "email"`, gated through `/approvals`.
- Approving an email-task auto-sends via Resend (`RESEND_API_KEY`, optional `RESEND_FROM`). Failures surface as toast + leave the task `blocked`. Every send logged in new `tool_calls` table.
- New `tool_calls` table (request/response audit) and `tasks.payload jsonb` for queued external actions.

**Pending (future):** GitHub, LinkedIn, lead pipeline activation.

---


Once Phases 1+2 prove the loop, wire real tools. Pattern is consistent: agent emits a `tool_call` → queued in `/approvals` (unless directive says auto) → on approve, server function executes → result logged in `audit_log` → linked back to originating task.

### 3.1 LinkedIn (for LinkedIn Lead Gen + Social Media + CMO)
- **Capabilities:** post to your profile, schedule post, fetch your own post analytics
- **Auth:** your LinkedIn Developer App, OAuth (`w_member_social`, `r_member_social` scopes), tokens stored as secrets (`LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN`)
- **Verbs added:** `:linkedin publish <draft_id>`, `:linkedin schedule <draft_id> <datetime>`, `:linkedin stats <post_id>`
- **Gating:** every publish goes through `/approvals` by default

### 3.2 GitHub (for CTO)
- **Capabilities:** list repos, read PRs, summarize diffs, triage issues; (gated) open issue, comment on PR, request changes
- **Auth:** GitHub Personal Access Token (fine-grained, repo scope), stored as `GITHUB_TOKEN`. Optional: upgrade to GitHub App later
- **Verbs added:** `:cto repo <name>`, `:cto pr <number>`, `:cto issue create <repo> <title>`, `:cto comment <pr_url>`
- **Gating:** reads auto, writes (issue/comment/merge) via `/approvals`

### 3.3 Outbound email (for Sales + CMO)
- **Capability:** send email via Resend (already a Lovable connector)
- **Verbs added:** `:sales email <lead_id>`, `:cmo announce <campaign_id>`
- **Gating:** every send via `/approvals`; bulk sends get a single batch approval card with full preview

### 3.4 Web search + scrape (for SEO + Sales discovery)
- **Capability:** web search + page extract via existing AI Gateway tools
- **Verbs added:** `:seo audit <url>`, `:sales research <company>`
- **Gating:** read-only, no approval needed

### 3.5 Lead pipeline activation
`leads` / `lead_replies` / `sequences` tables already exist. Wire them up:
- `:linkedin import <csv>` → populates `leads`
- `:sales sequence start <icp_id>` → creates a `sequences` row, daily cron drives next-step sends (each gated)
- Reply classification on inbound (when email connector active) → `lead_replies.classification`

### Phase 3 files (per integration)
- `src/serverfns/integrations/linkedin.functions.ts`
- `src/serverfns/integrations/github.functions.ts`
- `src/serverfns/integrations/email.functions.ts`
- `src/serverfns/integrations/research.functions.ts`
- `src/components/IntegrationsPanel.tsx` — connect/disconnect, last-sync, scope review
- DB migration — `integration_credentials` table (encrypted), `tool_calls` table (request/response audit)

**Outcome:** typing `:cmo campaign launch VDNX in MENA Q1` produces a brief, fans out drafts to Social + SEO + Sales, queues the launch-day LinkedIn post and the partner-announcement email in `/approvals`, opens a tracking issue in the VDNX GitHub repo for engineering tie-ins, and logs the whole chain in audit. One command → entire org moves.

---

## Out of scope (future)

- Multi-operator auth & per-user permissions
- Streaming responses (current non-streaming dispatch keeps things simple; revisit when artifacts exceed ~30s)
- Editing the command library from UI
- Mobile-optimized terminal layout
- Voice input / TTS readback

---

## Decisions baked in

- **Auto-dispatch internal drafting work, gate everything external.** Matches VDNX's Authority principle.
- **Lovable AI Gateway** for all model calls (no per-provider keys).
- **Tool-calling** (not "please return JSON") for all structured outputs.
- **One command at a time** — no autonomous agent loops in Phase 1–3. Operator stays in the loop.