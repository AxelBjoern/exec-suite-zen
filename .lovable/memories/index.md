# Memory: index.md
Updated: now

# Project Memory

## Core
All LLM calls go through OpenRouter via `src/server/llm.server.ts`. Do not use Lovable AI Gateway or `LOVABLE_API_KEY`.
Chat models are user-scoped: defaults plus each user's Agents & Models library. New owned models should become directly pickable in chat.
VDNX GitHub access is READ-ONLY. Never push, commit, write, create branches/PRs, or call any mutating GitHub API. Only read endpoints (contents GET, search) are allowed.
Semantic tokens only — never raw colors (`text-white`, `bg-gray-400`, hex). Use `bg-background/foreground/primary/accent/muted/panel/border/destructive` from `src/styles.css`. shadcn overlay primitives are the only exception.
Sonner-only toasts. Lucide-only icons. shadcn-only Card. No new npm packages unless explicitly requested.
Max 200 lines per component file; split if larger. All Supabase writes use `.select()` to verify.

## Memories
- [LinkedIn image design rules](mem://features/linkedin-image-design-rules) — per-user `user_settings.design_rules`, VDNX defaults auto-applied for axel@natax.co.uk
- [VDNX Build Rules](mem://constraints/vdnx-build-rules) — full adapted ruleset from the PDF: framework lock, pattern lock, reuse-first, style/security discipline, Stockholm quality rules
