## Goal
Two related failures:
1. Swarm agents time out at 60s and contribute nothing (screenshot: 4/6 stuck at `60.0s timeout`).
2. Dispatch/tool routing hard-codes model capability — `Dispatch failed for @board: Hermes 4 405B has no tool-capable endpoint right now`.

Fix both with per-agent fallback + longer primary timeout + dynamic tool capability.

## Design

### 1. Timeout: 60s → 100s primary, then fallback
- `draftOne` in `src/server/swarm-core.server.ts`: primary attempt uses **100s** (was 60s). On timeout/error, retry once on `fallbackModel` with a **45s** cap.
- Propagate `AbortController.signal` through `chatCompletion` in `llm.server.ts` so the 100s timer actually cancels the fetch instead of racing a stuck request.
- Same 100s primary / 45s fallback applies to dispatch calls.

### 2. Kill the hardcoded tool-capable allowlist
- Find `has no tool-capable endpoint` (likely `src/serverfns/ceo-chat.functions.ts` or `src/server/agent-tools.server.ts`) and any static `TOOL_CAPABLE_MODELS` set.
- Replace with `base_models.supports_tools boolean default true`, owner-editable in Agents & Models.
- Dispatch flow: try primary with tools → on provider tool-endpoint error, mark `supports_tools=false` in memory + retry once on the agent's fallback model → if no fallback, clean error asking the user to set one.

### 3. Per-agent fallback config
Extend each `swarm_agents` entry in `user_settings`:
```
{ role, model, enabled, systemPrompt, fallbackModel?, timeoutMs? }
```
- `fallbackModel`: swarm-eligible slug ≠ primary. Auto-default to `deepseek/deepseek-v4-flash` when in eligible set, else first eligible.
- `timeoutMs`: per-agent override; default **100000**, cap 180000.

Add `swarm_fallback_model`, `swarm_timeout_ms` (default 100000), `dispatch_fallback_model` on `user_settings`.

### 4. `DraftResult` + call sites
- New fields: `attempted_models: string[]`, `used_fallback: boolean`, `primary_error?: string`. `status: "ok"` if either attempt succeeds.
- Wire fallback into `src/serverfns/swarm.functions.ts` and `src/routes/api/public/swarm-stream.ts`; require fallback slug in `allowed`.
- Stream emits `event: draft_fallback` `{ index, from, to, reason }` before the retry's `draft` event so UI shows "Grok 4.3 timed out → retrying on DeepSeek V4 Flash".

### 5. UI
- `SwarmPopover.tsx` Agents tab: add "Fallback model" `<Select>` + "Timeout (s)" input (default 100) per agent row + global fallback row.
- `agents-models.tsx`: add "Supports tools" toggle per model (owner-editable).
- `MessageRow.tsx` `SwarmDrafts`: on `used_fallback`, badge row `↻ fallback → <label>` with tooltip = `primary_error`. Latency shows total (primary timeout + fallback time).

### 6. Persistence
- `swarm_drafts`: add `attempted_models text[]`, `used_fallback boolean default false`, `primary_error text`.
- `base_models`: add `supports_tools boolean default true`.
- Migration + GRANTs.

### 7. Defaults
On next swarm/dispatch run, agents without `fallbackModel` auto-fill with `deepseek/deepseek-v4-flash` (if eligible). No forced `user_settings` migration.

## Out of scope
- No parallel double-dispatch (cost). Retry fires only on failure.
- No synth-model fallback (synth already degrades to strongest draft).
