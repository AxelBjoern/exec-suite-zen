## Goal

Undo the Claude/Kimi-style merge (Slice 1 streaming + Slice 2 auto router) by rewriting the affected files back to the pre-slice behavior. Keep every other feature — the swarm quality breakdown, per-agent drafts, confidence bars, fallback badges, `/swarm-audit`, `/swarm-bench` — completely intact.

## What gets reverted

**Slice 1 — token streaming (single mode)**
- Delete `src/routes/api/public/chat-stream.ts` (SSE endpoint)
- Delete `src/lib/chat-stream.ts` (client SSE consumer + `isStreamEligible` + `ChatStreamFallback`)
- Remove streaming branch, `liveStream` state, and blinking-caret bubble from `ChatWorkspace.tsx`

**Slice 2 — auto router**
- Delete `src/serverfns/chat-router.functions.ts` (classifier server fn)
- Delete `src/components/chat/ChatModeToggle.tsx` (tri-mode toggle)
- Remove `chatMode` state, `localStorage` key `vdnx.chat.mode`, `classifyFn` call, `autoDecision` chip, and the toggle mount in the composer footer from `ChatWorkspace.tsx`
- Restore the previous binary `swarmActive` toggle exactly as it worked before Slice 1 (Swarm popover + swarm on/off), which is what the sidebar and swarm SSE path already expect

## What stays untouched (must not regress)

- `src/serverfns/swarm.functions.ts`, `src/server/swarm-core.server.ts`, `src/lib/swarm-stream.ts`, `src/routes/api/public/swarm-stream.ts`
- `SwarmPopover.tsx`, `MessageRow.tsx` badges (Primary / Fallback / Error, latency, confidence bars, rationale)
- `/swarm-audit`, `/swarm-bench`, `swarm_drafts`, `swarm_runs`, `swarm_bench_runs`
- Attachments, slash commands, `sendCeoMessage`, DSML tool loop, GitHub PAT flow, VDNX probe, Outbound, LinkedIn image generation
- All existing `ceo_chat_messages` / `ceo_conversations` rows

## `ChatWorkspace.tsx` — exact edits

1. Remove imports on lines 56–58 (`chat-stream`, `ChatModeToggle`, `classifyChatMode`).
2. Remove `CHAT_MODE_KEY`, `chatMode` state + effect, `classifyFn`, `autoDecision`, `liveStream`.
3. Reintroduce `const [swarmActive, setSwarmActive] = useState(false)` (or the prior persisted-key equivalent — will match whatever was there before Slice 1; verify from the pre-slice signature by inspection before writing).
4. In the send mutation: drop the `if (chatMode === "auto") classifyFn(...)` branch and the `streamChat(...) / ChatStreamFallback` block. Restore the original two-path dispatch: `swarmActive ? swarm SSE : sendCeoMessage`.
5. Drop the `mode: chatMode` field being persisted into any request payload.
6. In JSX: delete the `autoDecision` chip block (~line 891), the `liveStream` bubble (~line 950), and switch `showThinking && !liveDrafts && !liveStream` back to `showThinking && !liveDrafts`.
7. In the composer footer: replace `<ChatModeToggle .../>` with the previous swarm on/off control (the `SwarmPopover` trigger button that was there before Slice 1).

## Database — leave as-is (recommended)

The Slice 1/2 migrations only added **nullable** columns and flag columns; they are inert once the code stops writing to them:

- `ceo_chat_messages`: `model_used`, `latency_ms`, `tokens_in`, `tokens_out` (all NULL for legacy rows, harmless)
- `user_settings`: `chat_mode`, `enable_artifacts_panel`, `enable_projects`, `enable_tool_steps`, `enable_vision`, `enable_compaction`, `chat_experimental`

Recommendation: keep them. They cost nothing, break nothing, and preserve reversibility if you ever want to reintroduce streaming later. If you want a clean drop instead, say so and I'll add a migration step — otherwise I'll skip it.

## Verification after the revert

1. Typecheck / build passes with zero references to `chat-stream`, `chat-router`, `ChatModeToggle`, `chatMode`, `liveStream`, `autoDecision`, `classifyChatMode`, `isStreamEligible`.
2. Load `/chat/:sessionId` — single-model reply works via `sendCeoMessage` (non-streaming, same as before Slice 1).
3. Toggle Swarm on — SSE swarm stream, per-agent drafts, confidence bars, Primary/Fallback/Error badges all render.
4. `/swarm-audit` and `/swarm-bench` load and show historical runs.
5. Sidebar sessions, rename, attachments, slash commands, "Add to Outbound" all still work.

## Confirm before I switch to build mode

- Proceed with the revert as scoped above? (Slice 1 + Slice 2 only, quality breakdown + everything else preserved.)
- Keep the additive DB columns in place (recommended), or drop them in a follow-up migration?
