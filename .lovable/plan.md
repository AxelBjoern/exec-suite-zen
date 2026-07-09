## Diagnosis

Two regressions from the last outbound intent changes in `src/server/chat-intent.server.ts` and `src/serverfns/ceo-chat.functions.ts`:

1. **Chat feels broken / stalls.** The classifier SYSTEM prompt now says *"Quantity cues (‘a post’, ‘three posts’, ‘5 options’) always mean action='generate'"* and Grok is called on almost every user turn. It hijacks normal messages and, worse, forces `kind='none'` for anything with a number — so even the "post these" replies never reach the filer.
2. **No LinkedIn post is filed to /outbound.** When the user says "post these three on linkedin" after seeing a 3-post draft:
   - The classifier returns `kind='none'` (quantity cue rule above) → no filing path runs.
   - Even when it does classify as `linkedin` + `action='file'`, the code files a **single** `outbound_linkedin` row using the whole previous assistant message as `text`, so 3 requested posts become 1 blob.

## Fix

### `src/server/chat-intent.server.ts`
- Remove the "quantity cues always = generate" rule. Distinguish by verb only:
  - `file` verbs: send, post, publish, file, ship, share, schedule + "these/those/them/above/all of them".
  - `generate` verbs: write, draft, compose, create, generate, make, give me.
- Keep the `action==='generate' → kind='none'` short-circuit in `parseOutboundIntent`.
- Add a fast pre-check: if the text has no dispatch verb AND no `@mention`, return `{kind:'none'}` without calling the LLM. Keeps normal chat fast and stops the classifier from meddling.
- Reuse existing `parsePostCount` to detect how many posts the user is filing ("post these 3", "file all three").

### `src/serverfns/ceo-chat.functions.ts` (outbound auto-file block, ~1284–1413)
- When `intent.kind === 'linkedin'` and `action === 'file'`:
  1. Pull the previous substantive assistant message (existing lookup).
  2. Split it into posts using the same delimiters as `truncateToPostCount` (`---`, `### Post N`, `**Post N**`).
  3. Determine `count = min(parsePostCount(user msg), splitPosts.length)`; default to all split posts when the user said "these/all/them".
  4. For each post text: generate tagline + visual prompt + image, then call `fileOutboundFromChat` once per post.
  5. Aggregate results into a single assistant reply: `📨 Filed 3 LinkedIn posts in Outbound: [#a1b2 →](…), [#c3d4 →](…), [#e5f6 →](…)`.
- For `email` / `reminder`: unchanged single-row flow.
- Keep the "missing text falls back to previous assistant draft" logic, but only use it when the split produced ≥1 post.

### Guardrail
- Wrap the whole outbound block so any failure logs and falls through to the normal LLM reply (already partially done) — make sure the fast pre-check runs first so 99% of chat turns skip the classifier entirely and behave exactly as before.

## Files touched
- `src/server/chat-intent.server.ts` — prompt + pre-check.
- `src/serverfns/ceo-chat.functions.ts` — multi-post filing loop + aggregated reply.

No schema or UI changes.
