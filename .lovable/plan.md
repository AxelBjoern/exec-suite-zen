## Goal

Let operators type free-form prompts in the terminal — not just `:agent verb args`. Verbs keep working; prompts become the primary interaction.

## Input grammar (additive, nothing removed)

| Input | Behavior |
|---|---|
| `:cfo brief FY26 burn` | Existing structured verb dispatch (unchanged) |
| `@cfo what's our runway if we hire 5 engineers?` | Solo dispatch to CFO with free-form prompt |
| `@board should we raise a Series A now?` | Forced boardroom dispatch, router picks lead |
| `what's our runway if we hire 5 engineers?` | Auto-routed: router picks 1 agent (solo) or N agents (boardroom) |
| `/help`, `/tasks`, etc. | Unchanged |

Rule of thumb: starts with `:` → verb path. Starts with `@` → addressed prompt. Anything else → auto-route.

## Routing layer (new)

A small server function `routePrompt(prompt)` calls the LLM with a tool that returns:

```
{ mode: "solo" | "boardroom", primary_agent: slug, consult_agents: slug[], reasoning: string }
```

Heuristics in the router prompt:
- Single-domain question → solo, pick best-fit agent
- Cross-functional / strategic / "should we…" → boardroom, pick lead + 2–3 consults
- Always include the agent roster + one-line mandates so it picks intelligently

For `@agent ...`, skip the router; use that agent (solo) unless `@board` is also present.
For `@board ...`, run the router but force `mode: "boardroom"`.

## Agent execution (artifact-or-chat)

The dispatch handler currently always produces a structured artifact via `ARTIFACT_TOOL`. We extend it so the agent can choose:

- Add a second tool `CHAT_TOOL` that returns `{ reply_markdown, suggested_next_commands[] }` for short conversational answers.
- Update the system prompt: "If the request is a quick question, use chat_reply. If it warrants a full deliverable (plan, model, memo, RFC), use produce_artifact."
- For verb dispatches, force `tool_choice = produce_artifact` (preserves current behavior — every verb still yields an artifact).
- For free-form prompts, leave `tool_choice = auto` so the model picks.

Chat replies render inline in the thread panel (markdown) without the artifact card; artifact replies render the existing ArtifactCard. Both still hash-chain into the audit log and write to `decision_log`.

## Verb inference (lightweight)

When a free-form prompt routes to an agent, we still need a `verb` for storage. Approach:
- The router also returns an optional `inferred_verb` from that agent's verb list, defaulting to `"respond"` if none fits.
- `respond` is added as a generic verb in `INTERNAL_VERBS` (auto-dispatch, no approval gate by default) — external actions (email/publish) still require explicit `:agent <external-verb>` syntax to keep the approval gate tight.

## UI changes

`src/components/Terminal.tsx`:
- New `exec()` branches for `@agent ...`, `@board ...`, and bare-text prompts.
- Show a one-line "ROUTING → CFO (solo)" or "ROUTING → BOARDROOM lead=CEO consults=CFO,CMO" trace before dispatch.
- Update `/help` text and palette hints.
- Autocomplete: when input starts with `@`, suggest agent slugs (`@ceo`, `@cfo`, `@board`, …).

`src/lib/command-library.ts`:
- Add a `prompt` category with examples like `@cfo runway if we hire 5 engineers` so the palette teaches the new syntax.

## Files touched

- `src/serverfns/terminal.functions.ts` — add `routePrompt` server fn; extend `dispatch` to accept `{ mode: "verb" | "prompt", prompt?: string }` and pass `CHAT_TOOL` alongside `ARTIFACT_TOOL`.
- `src/lib/agent-schemas.ts` — add `CHAT_TOOL` schema; add `respond` to `INTERNAL_VERBS`; add `RouteDecision` schema.
- `src/lib/agent-prompts.ts` — add `buildRouterPrompt()` (roster + mandates + routing rules); update `buildSystemPrompt()` with the artifact-or-chat instruction.
- `src/components/Terminal.tsx` — new input parsing, routing trace, `@`-autocomplete, updated `/help`.
- `src/components/ArtifactCard.tsx` (or thread renderer) — render chat replies as markdown when artifact is absent.
- `src/lib/command-library.ts` — palette entries for prompt syntax.

No DB migration needed (reuses `threads`, `messages`, `decision_log`, `audit_log`).

## Out of scope

- Streaming responses (still single-shot tool call).
- Multi-turn conversation refinement inside one thread (already supported via existing thread continuation).
- Changing approval gating for external verbs.