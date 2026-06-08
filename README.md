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
