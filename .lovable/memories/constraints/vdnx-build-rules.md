---
name: VDNX Build Rules
description: Non-negotiable build rules from vdnx-build-rules-2026-05-17.pdf, adapted to this TanStack Start stack
type: constraint
---
Adapted from the VDNX Build Rules PDF (May 17, 2026). The PDF references a React Router v6 / src/pages stack; this project is TanStack Start / src/routes. Spirit of the rules applies; literal folder names do not.

**Framework lock**: React 18 + Vite + Tailwind v4 + TypeScript + Supabase + shadcn/ui + TanStack Start/Router/Query. Do NOT add new frameworks, state managers, UI kits, validators, routers, icon libraries, or toast libraries.

**Dependency lock**: Do not add npm packages unless explicitly requested. Build with existing utilities in `src/lib/`, `src/server/`, `src/serverfns/`. **Why:** dependency creep and supply-chain risk.

**Pattern lock**: Mirror existing route/component/server-function patterns exactly. Server logic = `createServerFn` in `src/lib/*.functions.ts` or `src/serverfns/`. Public API = `src/routes/api/public/*`. Pages = `src/routes/`. Components = `src/components/`.

**Reuse-first**: Before creating anything new, search the repo for an existing component, hook, server fn, or util to reuse or extend.

**No external code paste**: No code from blogs/StackOverflow/docs snippets.

**No incidental refactors**: Only touch what the request requires. Don't "clean up" unrelated files.

**Type discipline**: No `any` unless unavoidable. Use Supabase types from `src/integrations/supabase/types.ts` (read-only, auto-generated).

**Style discipline — semantic tokens only**: NEVER use raw colors (`text-white`, `bg-black`, `text-gray-400`, `bg-[#1E3A5F]`, `text-blue-500`). Always use semantic tokens from `src/styles.css`: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-accent`, `text-accent-foreground`, `bg-muted`, `text-muted-foreground`, `bg-panel`, `bg-panel-2`, `border-border`, `bg-destructive`. Exception: shadcn UI primitives (dialog/sheet/drawer/alert-dialog overlays) ship with `bg-black/80` — leave those alone.

**Gold fill rule**: Always pair `bg-primary` with `text-primary-foreground`, `bg-accent` with `text-accent-foreground`. Never `text-accent` on filled gold buttons.

**Toast**: `sonner` only. `import { toast } from "sonner"`. Never `react-toastify`, never custom toasts.

**Icons**: `lucide-react` only.

**Loading**: `<Loader2 className="h-4 w-4 animate-spin" />` from lucide-react.

**Forms**: react-hook-form + zod + shadcn `<Form>`.

**Cards**: shadcn `<Card>` — no custom card wrappers.

**Stockholm quality rules**:
- Max 200 lines per component file. If larger, split into sub-components.
- AI drafts, humans approve — never auto-publish external actions; route through `approvals`.
- `.select()` after Supabase update/insert/delete to verify modifications.
- Hooks consuming contexts must implement safe access patterns (no crash on missing provider).
- Non-critical fetches use silent logging (`logger.warn`), not toast errors.
- Effects that save must use `useRef` callback pattern to prevent infinite loops.
- Semi-static queries need `staleTime` (e.g., 10 min).

**Security discipline**: Never bypass auth/RLS. All server fns that touch user data use `requireSupabaseAuth`. Roles live in `user_roles` via `has_role()`, never on profile rows. Webhooks under `/api/public/*` MUST verify signatures.

**Page layout pattern**:
```tsx
<div className="p-4 md:p-6 space-y-4 md:space-y-6">
  <div>
    <h1 className="text-xl md:text-2xl font-bold text-foreground">Title</h1>
    <p className="text-muted-foreground mt-1 text-sm">Subtitle</p>
  </div>
  {/* Content */}
</div>
```

**First step every time**: Find the closest existing example in this repo and clone its structure.
