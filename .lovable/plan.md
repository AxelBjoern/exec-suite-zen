# Swarm Mode for Chat

Add a Swarm toggle in the composer that fans a single prompt out to N user-picked models in parallel, then a synthesizer model merges them into one best-in-class answer. Users pick which models participate + which synthesizes in Settings → Models.

## UX

Composer (`src/components/chat/ChatComposer.tsx`):
- New "Swarm" pill button next to the model select (Users icon, `variant=secondary` when on).
- When active: badge shows count e.g. `Swarm · 4 models`.
- Click opens a small popover to quickly toggle which of the user's allowed models participate for this turn + pick synthesizer. Persisted per-conversation.
- Placeholder switches to "Swarm mode — N models will draft, 1 will synthesize".
- Disabled with tooltip if fewer than 2 swarm models configured.

Message (`MessageRow.tsx`):
- Assistant message rendered normally (the synthesized answer).
- Below it: collapsible "Swarm drafts (N)" accordion showing each model's draft, latency, token count, and a "Use this instead" action that swaps it into the final answer.
- Small badge next to the assistant avatar: "Swarm · synth by <model>".

Settings → Models:
- New section "Swarm Configuration":
  - Multi-select checkboxes over the user's enabled models → "Use in swarms".
  - Radio → "Synthesizer model" (defaults to strongest allowed: Claude Opus 4.7 → GPT 5.3 → Hermes 4 405B → first available).
  - Slider "Max parallel drafters" (2–6, default 4) to cap cost.
- Persisted in `user_settings` (new columns: `swarm_models text[]`, `swarm_synth_model text`, `swarm_max_parallel int`).

## Server

New `src/serverfns/swarm.functions.ts`:
- `runSwarm({ conversationId, content, attachmentIds, models[], synthModel })`:
  1. `Promise.allSettled` calls to each drafter via existing `src/server/llm.server.ts` (OpenRouter). Per-model timeout ~45s, hard 90s cap.
  2. Persist each draft to new table `swarm_drafts` (run_id, model_slug, content, latency_ms, tokens_in, tokens_out, status, error).
  3. Feed drafts (labeled A/B/C/D + model names) into synthesizer with a fixed synthesis prompt: "You are the arbiter. Merge the drafts into one final answer that is more accurate, complete, and useful than any individual draft. Cite disagreements briefly if material. Never mention model names."
  4. Save synthesized reply as the assistant message in existing `ceo_chat_messages` with metadata `{ swarm_run_id }`.
- `getSwarmRun(runId)` → drafts + synth for the collapsible UI.
- Uses only the 8 allowed models from core memory. Skips any drafter whose slug isn't in that list.

`sendCeoMessage` in `ceo-chat.functions.ts`: accept optional `swarm: { models, synth }`; when present, dispatch to `runSwarm` instead of single-model path. Same tool/context injection is passed through to drafters and synthesizer.

## Schema

New migration:
- `alter table user_settings add column swarm_models text[], swarm_synth_model text, swarm_max_parallel int default 4;`
- `create table swarm_runs (id uuid pk, user_id uuid, conversation_id uuid, message_id uuid, synth_model text, created_at timestamptz)` + RLS + GRANTs.
- `create table swarm_drafts (id uuid pk, run_id uuid fk, model_slug text, content text, latency_ms int, tokens_in int, tokens_out int, status text, error text, created_at timestamptz)` + RLS + GRANTs.

## Benchmark harness (best-in-class polish)

New route `src/routes/_authenticated/swarm-bench.tsx` (owner-only, gated by `isVdnxOwnerEmail`):
- Textarea prompt + "Run benchmark".
- Runs the prompt through each allowed model individually AND through swarm mode.
- Table of results: latency, tokens, cost estimate (from OpenRouter pricing), and a quality vote where the synthesizer scores each output 1–5 with a rubric (accuracy, completeness, reasoning, style).
- Persisted to `swarm_bench_runs` so we can iterate on the synthesis prompt.
- Used one-time to tune: drafter count (default 4), which models are best drafters vs. synthesizers, synthesis prompt wording. Findings baked into the default `swarm_synth_model` + starter `swarm_models` for new users.

## Cost / safety

- Hard concurrency cap = `swarm_max_parallel` (user), global 6.
- Per-run budget check; if any drafter errors, synthesizer still runs on the successful subset. If <2 succeed, fall back to single-model reply and toast "Swarm degraded — used <model>".
- Streaming: drafters run non-streaming (small parallelism, buffered); synthesizer streams to UI so the user still sees tokens.

## Files touched

- add: `src/serverfns/swarm.functions.ts`, `src/routes/_authenticated/swarm-bench.tsx`, `src/components/chat/SwarmPopover.tsx`, migration for `user_settings` + `swarm_runs` + `swarm_drafts`.
- edit: `ChatComposer.tsx` (button + popover + prop), `ChatWorkspace.tsx` (swarm state, pass to send), `MessageRow.tsx` (drafts accordion), `ceo-chat.functions.ts` (swarm branch), settings/models page (swarm config section).
