# VDNX Terminal

Institutional Company Operating System — an executive workspace combining chat, terminal, budget modeling, agent forge, outbound (email + LinkedIn), and approvals.

**Live:** https://exec-suite-zen.lovable.app

## Philosophy & Workflow

This project is **not** built with "full AI auto-loops".

After 3+ years using AI daily, I follow a pragmatic, quality-first approach:

- **Claude Opus 4.8 (max intelligence)** → Analysis, architecture, and planning
- **Lovable** → Rapid prototyping and UI generation
- **DeepSeek V4 Flash / Qwen** (via OpenRouter) → Most implementation work (fast + very cheap)
- **Heavy human review** on all critical systems (ownership, payments, compliance, audit trails)

**Memo payments** were built manually without connectors or loops — and work reliably.

I believe the real skill is **designing systems where you stay in control**, not handing everything to the AI.

## Why Open Source?

To show a realistic, production-minded workflow instead of the usual hype.

## Onboarding: How the VDNX Agent System Works

VDNX is organized around **specialized executive agents** — each with a defined role, a verb vocabulary, and a structured output contract. Think of it as a boardroom you can summon at any time.

### The Executive Roster (Built-in Agents)

| Agent | Role | What to ask it for |
| --- | --- | --- |
| `ceo` | Chief Executive Officer | Strategy, board decks, vision, capital allocation, quarterly goals |
| `cfo` | Chief Financial Officer | Burn/runway analysis, financial models, forecasts, variance commentary, board packs |
| `coo` | Chief Operating Officer | SOPs, runbooks, incident reports, OKRs, operational status |
| `cto` | Chief Technology Officer | Architecture RFCs, engineering roadmaps, postmortems, code reviews |
| `cmo` | Chief Marketing Officer | Campaigns, positioning, launch plans, editorial calendars |
| `cco` | Chief Compliance Officer | Policy drafts, KYC/AML reviews, risk memos, audit prep, disclosures |
| `sales` | Head of Sales | Outbound sequences, proposals, pipeline reviews, discovery calls, close plans |
| `linkedin` | LinkedIn Lead Gen Specialist | Connection notes, DM sequences, profile audits, engagement strategy |
| `social` | Social Media Expert | Thread copy, caption packs, content calendars, trend briefs |
| `seo` | SEO Expert | Keyword maps, content briefs, technical audits, backlink plans |

### Two Modes of Interaction

**1. Chat (`/chat`)**
Free-form conversation with the executive board. Ask anything in natural language — the **Router** automatically picks the right agent(s) to answer.

**2. Terminal (`/terminal`)**
Structured command surface for precise, repeatable operations. Use agent verbs with the `:` prefix:

```
:cfo model ARR ramp at 12% net new logos
:cmo campaign Q3 product launch
:cto rfc Multi-tenant data isolation
```

### Solo vs Boardroom

- **Solo mode** (default): One agent handles the request directly. Best for single-domain tasks.
- **Boardroom mode** (`:board <agent> <verb>`): The lead agent answers, and 1–3 peer agents automatically consult. Best for cross-functional or strategic decisions.

Example:
```
:board cfo forecast
# CFO leads, CEO and COO consult automatically
```

### How Agents Produce Output

Every agent uses **structured tool-calling** — not free text. The output is always a formal artifact with:

- **Title** — one strong line
- **Sections** — heading + markdown body (tables, bullets, analysis)
- **Action Items** — concrete tasks routed to other agents with owners, deliverables, and due dates
- **Suggested Next Commands** — follow-up commands you can run immediately

This means you never get vague advice. You get a **decision-grade deliverable** you can act on or delegate.

### The Approval Gate

VDNX follows a **human-in-the-loop** principle:

- **Auto-dispatch = true**: Internal work (drafts, analysis, models) routes automatically to the assigned agent.
- **Auto-dispatch = false**: External actions (posts, emails, publishes, commits, announcements) queue in `/approvals` for human review before shipping.

External keywords (`post`, `send`, `publish`, `commit`, `deploy`, `launch-day`, etc.) always force approval — regardless of what the model suggests.

### Creating Custom Agents (`/forge`)

The built-in roster covers standard executive functions. Use `/forge` to train and deploy specialized agents on your own OpenRouter models for domain-specific work (e.g. legal review, technical support, industry research).

### Quick Command Reference

| Pattern | Purpose |
| --- | --- |
| `:<agent> <verb> <args>` | Invoke an agent verb |
| `:board <agent> <verb>` | Boardroom mode with peer consultation |
| `/help` | List all commands |
| `/agents` | Open the executive roster |
| `/approvals` | Open the human approval queue |
| `/directive <agent> <text>` | Pin a standing directive to an agent |
| `Ctrl/Cmd + K` | Open the command palette |

### Principles to Remember

1. **Authority** — AI drafts, humans approve. No autonomous external commits.
2. **Auditability** — Every material action is SHA-256 hash-chained. `/verify` checks integrity.
3. **Atomicity** — Operations are atomic with strict role-based security.
4. **No generic output** — Every deliverable must save time, increase revenue, or reduce cost.

## Stack

- TanStack Start v1 (React 19, Vite 7) — file-based routing under `src/routes/`
- Tailwind v4 via `src/styles.css` (semantic tokens only)
- Lovable Cloud (Supabase) — auth, Postgres, RLS, storage
- LLM access via OpenRouter (`src/server/llm.server.ts`)
- shadcn/ui + lucide-react + sonner

## Modules

| Route | Purpose |
| --- | --- |
| `/chat` | Free-form conversation with the executive board |
| `/terminal` | Structured-verb command surface |
| `/budget` | Scenario modeling, P&L, cash flow, sensitivity |
| `/forge` | Train and deploy specialized agents |
| `/outbound` | Email, self-reminders, LinkedIn posts |
| `/approvals` | Owner review of outbound mail and posts |
| `/settings` | Connections (Gmail / LinkedIn), models, guardrails |

## Development

```bash
bun install
bun run dev
```

The dev server proxies Lovable Cloud automatically; no `.env` setup is required (auto-generated).

## Server-side logic

All app-internal server logic uses TanStack `createServerFn` — see `src/lib/*.functions.ts` and `src/serverfns/`. Public webhooks and cron live under `src/routes/api/public/`.

## Conventions

- Semantic Tailwind tokens only (`bg-background`, `text-foreground`, `bg-panel`, etc.). No raw colors.
- Sonner-only toasts. Lucide-only icons. shadcn-only Card.
- Max ~200 lines per component file.
- All Supabase writes use `.select()` to verify.

## Deployment

Click **Publish** in the Lovable editor. Backend changes deploy immediately; frontend changes go live on publish.
