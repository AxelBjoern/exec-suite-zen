## What's broken

Two related bugs in the LinkedIn flow:

**Bug A — outbound stub swallows authoring requests.**
`src/serverfns/ceo-chat.functions.ts` (~L1287–1300) sends every user message through `parseOutboundIntent` (`src/server/chat-intent.server.ts`). The classifier tags "write a LinkedIn post about X" as `kind: linkedin`, sees no post text embedded in the message, marks `text` as missing, and returns "I still need: text." The LLM never sees the request, so it never writes anything.

**Bug B — the model ignores the requested count.**
When authoring does run, the system prompt / post-processing produces multiple posts even when the user asked for one (you asked for one, got three). The count in the user's message ("one", "a post", "three posts", "5 variants") must drive the output exactly.

## Fix

### 1. `src/server/chat-intent.server.ts`
- Add `action: "file" | "generate" | "unknown"` to the classifier tool + SYSTEM prompt.
  - *send / post / publish / schedule / share this / file* → `file`.
  - *write / draft / create / compose / generate / make / give me / help me with* → `generate`.
  - Any quantity cue ("a post", "one post", "three posts", "5 options") → force `generate`.
- Only report `email` / `linkedin` / `reminder` when the user is dispatching existing content. Authoring requests return `kind='none'` or `action='generate'`.

### 2. `src/serverfns/ceo-chat.functions.ts` — outbound intent block
- If `intent.action !== 'file'` → skip the stub, fall through to the normal LLM turn so the model actually reads the message.
- If `intent.action === 'file'` and text/body missing:
  - Pull from the previous assistant message if it contains a substantive draft (≥ 40 chars, not a question/stub).
  - Otherwise keep today's "I still need X" prompt.
- Same `action` gate for email/reminder. Missing *recipient* on a real send still asks.

### 3. Respect the requested post count (Bug B)
Add a small `parsePostCount(userText)` helper used only when the LLM turn is producing LinkedIn content:
- Detect explicit numerics ("1", "2", "3", "one", "two", "three", "a", "an", "a couple" → 2, "a few" → 3). Default to **1** if no count is given.
- Pass the resolved count into the LinkedIn authoring system prompt as a hard rule: *"Produce exactly N post(s). Do not produce more, do not produce variants."*
- In the response post-processor for LinkedIn, if the model returned more than N clearly-separated posts (delimiters like `### Post`, `---`, `Post 1/2/3`), truncate to the first N and log that it was over-produced.
- Never auto-multiply: if the user asked for one, ship one.

### 4. Guardrails
- Messages < 8 chars or starting with an already-handled `@mention` skip `parseOutboundIntent`.
- When in doubt, fall through to the model — never let the outbound stub swallow a message the LLM should have answered.

## Result

- "write a LinkedIn post about X" → **one** post.
- "write three LinkedIn posts about X" → exactly **three** posts.
- "post this on LinkedIn: <text>" → files to /outbound.
- "post this" after a draft → files that draft.
- Missing recipient on a real send still asks.

## Files touched

- `src/server/chat-intent.server.ts` — add `action`, tighten prompt.
- `src/serverfns/ceo-chat.functions.ts` — gate auto-file on `action === 'file'`, add previous-draft fallback, add `parsePostCount` + enforce N in LinkedIn authoring prompt + truncate over-production.

No UI, schema, or unrelated flow changes.
