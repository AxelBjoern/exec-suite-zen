## Goal
Run a live end-to-end swarm test against the running preview and confirm the quality breakdown UI renders correctly at runtime.

## Steps

1. **Auth into the preview with Playwright**
   - Restore the injected Supabase session (`LOVABLE_BROWSER_SUPABASE_*` env) into localStorage + cookies on `http://localhost:8080`.
   - Navigate to `/chat`, wait for the sidebar to hydrate, and screenshot the landing state.

2. **Open a new session and enable Swarm**
   - Click "New chat" (or navigate to `/chat/<newId>`), then open the SwarmPopover and toggle Swarm ON.
   - Verify at least one swarm-eligible agent role has a model + fallback configured; screenshot the popover state.

3. **Send a swarm prompt**
   - Prompt: `"In 3 short bullets, what makes a great B2B outbound opening line? Then rate your own answer 1-10."` (short, cheap, forces reasoning + self-eval so the breakdown has signal).
   - Submit via the composer.

4. **Observe the live SSE stream**
   - Watch for `liveDrafts` cards appearing per agent with Primary/Fallback/Error badges + latency.
   - Screenshot mid-stream (after ~15s) to capture in-flight drafts.
   - Wait for the final synthesized assistant message.

5. **Verify the quality breakdown UI**
   - On the final MessageRow, expand the swarm breakdown panel.
   - Confirm each draft card shows: agent label, model slug, Primary/Fallback/Error badge, latency, confidence bar (0–100), and rationale text.
   - Screenshot the expanded breakdown.

6. **Cross-check server-side**
   - Query `swarm_runs` and `swarm_drafts` for the most recent run: confirm rows exist, `confidence` + `rationale` populated, `attempted_models` / `used_fallback` set correctly.
   - Tail server logs for any errors during the run.

7. **Report**
   - Pass/fail per check with screenshot references.
   - Flag any regression (missing badge, empty rationale, zero confidence across the board, SSE stalled, synth failed, etc.).

## Notes
- Read-only verification — no code edits.
- If `LOVABLE_BROWSER_AUTH_STATUS` is not `injected`, I'll stop and ask you to sign in via the preview so the session mints.
- If the swarm reply falls back to plain synth (breakdown JSON parse failed), that itself is the finding to report.
