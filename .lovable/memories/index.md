# Memory: index.md
Updated: now

# Project Memory

## Core
All LLM calls go through OpenRouter via `src/server/llm.server.ts`. Do not use Lovable AI Gateway or `LOVABLE_API_KEY`.
ONLY these 8 models are allowed anywhere (code, errors, UI, logs): Hermes 4 405B (`nousresearch/hermes-4-405b`), Grok 4.3 (`x-ai/grok-4.3`), ChatGPT 5.3 (`openai/gpt-5.3-chat`), Claude Opus 4.7 (`anthropic/claude-opus-4.7`), DeepSeek V4 Pro (`deepseek/deepseek-v4-pro`), DeepSeek V4 Flash (`deepseek/deepseek-v4-flash`), Nemotron 3 Nano Omni 30B (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`), Kling v3.0 Std (`kwaivgi/kling-v3.0-std`, video generation). No fallback models, no other versions, ever.
VDNX GitHub access is READ-ONLY. Never push, commit, write, create branches/PRs, or call any mutating GitHub API. Only read endpoints (contents GET, search) are allowed.
Semantic tokens only — never raw colors (`text-white`, `bg-gray-400`, hex). Use `bg-background/foreground/primary/accent/muted/panel/border/destructive` from `src/styles.css`. shadcn overlay primitives are the only exception.
Sonner-only toasts. Lucide-only icons. shadcn-only Card. No new npm packages unless explicitly requested.
Max 200 lines per component file; split if larger. All Supabase writes use `.select()` to verify.

## Memories
- [LinkedIn image design rules](mem://features/linkedin-image-design-rules) — per-user `user_settings.design_rules`, VDNX defaults auto-applied for axel@natax.co.uk
- [VDNX Build Rules](mem://constraints/vdnx-build-rules) — full adapted ruleset from the PDF: framework lock, pattern lock, reuse-first, style/security discipline, Stockholm quality rules
