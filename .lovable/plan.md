## Problem
Swarm conversations stay titled "New conversation" (or the raw first message) forever. The direct-chat path calls `maybeAutoTitleConversation` after saving the assistant reply, but the SSE swarm path in `src/routes/api/public/swarm-stream.ts` never does.

## Fix
Wire the existing auto-title helper into the swarm SSE stream — no new logic, same helper, same model, same rules as direct chat.

1. Export `maybeAutoTitleConversation` from `src/serverfns/ceo-chat.functions.ts` (currently module-private).
2. In `src/routes/api/public/swarm-stream.ts`, after the assistant message is inserted and `ceo_conversations.updated_at` is bumped, call:
   ```ts
   await maybeAutoTitleConversation({
     admin, conversationId: convId, userText: content, assistantText: finalContent,
   });
   ```
   Wrap in try/catch so a title failure never breaks the stream. Do this before `send("done", ...)`.

## Behavior
- Matches direct chat: only renames when current title is empty, "New conversation", or the auto-derived-from-first-message fallback.
- Uses the same cheap allowed model already configured in the helper.
- Sidebar picks up the new title on the next `refetchConvos` (already invalidated when the stream completes).

## Out of scope
No UI, DB, or swarm-logic changes. Manual rename still works.