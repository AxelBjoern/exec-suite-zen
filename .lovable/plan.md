## Goal

Fix the CEO chat on `/` so each conversation is fully isolated. Today, sending a message in one chat can show up in (or yank the user back to) another, because the client tracks pending state globally and the server can resurrect a deleted/foreign conversation id.

## Root causes

1. **Client uses one global `pendingUser` state.** When you switch conversations while a reply is in flight, the in-flight bubble renders in the new conversation too (it isn't keyed by `conversationId`).
2. **`mutation.onSettled` blindly adopts the server's `saved.conversation_id`** and calls `setActiveId(newId)`. If the user switched conversations mid-flight, this yanks them back to the original chat.
3. **`docMutation` (`/pdf`, `/docx`) has the same two bugs.**
4. **`ensureCeoConversation` on the server re-creates a conversation row using whatever id the client passed** if it doesn't exist. Stale localStorage ids (after delete, after another tab cleared) cause a "ghost" conversation to be recreated and shared.
5. **`clearCeoChat` / cache invalidation isn't scoped** — `invalidateQueries(["ceo-chat"])` is fine, but combined with #1 and #2 it surfaces the wrong messages briefly.

## Changes

### `src/routes/index.tsx` (CEO chat UI)

- Replace single `pendingUser` with `pendingByConvo: Record<string, { content; attachments }>`. Set/clear keyed by the `targetConversationId` captured at mutate time, and only render the bubble when `activeId === targetConversationId`.
- In both `mutation` and `docMutation`:
  - Capture `const targetConversationId = activeId` in `mutationFn`, pass it through to `onSettled` via the mutation's `context`/return.
  - In `onSettled`, only `setActiveId(saved.conversation_id)` when `targetConversationId === null` (i.e. we started without an active chat). Never override an explicit switch.
  - Invalidate only `["ceo-chat", saved.conversation_id]` instead of the whole `["ceo-chat"]` family.
- Same fix for `clearMutation`: capture the convo id at mutate time so a switch mid-clear can't wipe the wrong chat's cache.
- Abort the in-flight request when the user switches `activeId` (call `abortRef.current?.abort()` in the existing `useEffect([activeId])`). This prevents a late reply from landing in the wrong chat's cache.
- Key the messages list container by `activeId` (`<div key={activeId}>`) so React fully unmounts the previous transcript on switch.

### `src/serverfns/ceo-chat.functions.ts`

- In `ensureCeoConversation`: if a `conversationId` is supplied but no row exists, do NOT recreate it with the same id. Insert a brand-new conversation (let Postgres assign a fresh uuid) and return that id. This breaks the "ghost-revive" path that lets a stale id from one browser/tab reappear elsewhere.
- `sendCeoMessage`, `generateCeoDocument`, `clearCeoChat`: unchanged externally — they already return `conversation_id`, which the client will use (per the new rule above) only when the user started without an active conversation.

### Out of scope

- No auth, no tenancy model. All chats remain globally readable (per the answer to the clarifying question). The fix is strictly about isolating the active conversation from in-flight state of other conversations.
- No DB schema changes, no RLS changes, no changes to `terminal.functions.ts`, `llm.server.ts`, or other agents.

## Verification

1. Open chat A, send a long message, immediately switch to chat B before the reply arrives → reply lands in A, B stays empty, no bubble flashes in B, the URL/active id stays on B.
2. From "no active conversation" send a message → server creates a conversation, UI adopts that id (existing happy path still works).
3. `/pdf` and `/docx` in chat A, switch to B mid-generation → document lands in A, B unaffected.
4. Delete chat A while a request is mid-flight → no ghost recreated under A's id; pending bubble disappears.
