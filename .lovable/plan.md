## Replace intent-based outbound filing with an explicit "Add to Outbound" button

The current flow tries to guess when the user wants to file a post ("post these", "send", etc.) and keeps misfiring. Replace it with a button on every assistant message that looks like a LinkedIn draft — nothing gets filed until the user clicks.

### 1. Detect drafts on assistant messages (client-side, presentation only)

In `src/components/chat/MessageRow.tsx`:
- Add a helper `looksLikeLinkedInDraft(text)` — true when the message has ≥ 1 hashtag OR a post delimiter (`\n---\n`, `### Post N`, `**Post N**`) AND length ≥ 200, AND is not a question.
- When true, render an **"Add to Outbound"** button next to the existing Copy button on assistant messages.
- If `splitPosts(text).length > 1`, label it **"Add N posts to Outbound"**.

### 2. New server function: file drafts directly

New `fileLinkedInDrafts` in `src/lib/outbound.functions.ts` (or a new `src/lib/outbound-file.functions.ts` if cleaner):
- Input: `{ text: string }`.
- Uses `splitPosts` from `src/server/chat-intent.server.ts` to break into N posts.
- For each chunk ≥ 50 chars, inserts one `outbound_linkedin` row (status `pending`, same shape the current filer uses).
- Returns `{ ids: string[], count: number }`.
- Guarded by `requireSupabaseAuth`.

### 3. Wire the button

- Button handler calls `fileLinkedInDrafts({ data: { text } })` via `useServerFn`.
- On success: toast `Added N post(s) to Outbound` with a link to `/outbound`. Button becomes disabled + shows "Added ✓".
- On failure: toast the error, keep button clickable.

### 4. Remove the auto-file intent path

In `src/serverfns/ceo-chat.functions.ts`:
- Remove the LinkedIn `action === 'file'` branch (history walking, meta-prose filtering, retry loop, auto-filing). The CEO turn just answers — it never writes to outbound.
- Keep the LinkedIn **authoring** path (N-posts system prompt + one retry) exactly as it is now, so "write 3 posts about X" still returns 3 posts in chat.
- Email and reminder dispatch branches stay as-is (out of scope).

In `src/server/chat-intent.server.ts`:
- Drop `linkedin` from the classifier so it never returns that kind. `splitPosts` / `parsePostCount` stay (used by CEO authoring + new file fn).

### Files touched
- `src/components/chat/MessageRow.tsx` — draft detector + Add-to-Outbound button.
- `src/lib/outbound-file.functions.ts` — new `fileLinkedInDrafts` server fn.
- `src/serverfns/ceo-chat.functions.ts` — remove LinkedIn auto-file branch; keep authoring.
- `src/server/chat-intent.server.ts` — remove `linkedin` kind from classifier.

No schema changes. Email/reminder flow untouched.
