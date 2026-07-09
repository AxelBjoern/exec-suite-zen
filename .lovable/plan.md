## Fix "Add to Outbound" so chat-authored posts always file to Outbound

### Root cause

The button is already wired to `fileLinkedInDrafts` in `src/lib/outbound.functions.ts` (which inserts pending `outbound_linkedin` rows in `approvals`). The wiring works — the reason posts don't reach Outbound is:

1. The assistant sometimes replies with only a preamble ("Here are two fresh posts…") and no post bodies. Nothing to file.
2. `looksLikeLinkedInDraft` in `src/components/chat/MessageRow.tsx` requires ≥200 chars AND (`#hashtag` OR `---` OR `### Post N` OR `**Post N**`). Posts without hashtags / dividers never show the button.
3. The button has no signal from the surrounding turn — it can't tell "this was a LinkedIn authoring turn" and only inspects the message text.

### Changes

**1. `src/components/chat/MessageRow.tsx` — always show the button on LinkedIn authoring turns**
- Accept a new optional prop `linkedInAuthoring?: boolean` on `MessageRow` / `AddToOutboundButton`.
- When `linkedInAuthoring` is true, skip `looksLikeLinkedInDraft` and render the button as long as the reply has ≥80 non-preamble chars.
- Relax `looksLikeLinkedInDraft` for the fallback path: drop the `#hashtag`/divider requirement and use length ≥200 + not a pure question/apology.
- Lower `splitPostsClient`'s min-chunk from 20 to keep short chunks; use the detected count for the label.

**2. `src/routes/_authenticated/chat.tsx` — pass authoring flag per assistant message**
- Track which assistant message IDs replied to a LinkedIn-authoring user turn (reuse the same regex logic as `ceo-chat.functions.ts`: `mentionsPost && authoringVerb`, `numericPostAsk`, or `parsePostCount ≥ 2` on the immediately preceding user message).
- Pass `linkedInAuthoring` to `<MessageRow>` for those messages.

**3. `src/lib/outbound.functions.ts` — file even short/preamble-only content safely**
- In `fileLinkedInDrafts`, lower the per-chunk filter from `>= 50` to `>= 30` and, if the split yields zero valid chunks, still file the whole text as one row (already the fallback — keep it, but ensure the min-length filter doesn't drop legitimate short posts).
- Return `{ ids, count, errors, skipped }` so the toast can say "Nothing to file — reply had no post body" instead of a generic error.

**4. `src/serverfns/ceo-chat.functions.ts` — stop preamble-only replies**
- In the LinkedIn authoring branch, after the retry, if `splitPosts(reply).length === 0` AND the reply is short (<400 chars) OR looks like preamble (`/^(here (are|is)|sure|okay|got it)/i`), do one more retry with a hard instruction: "Return ONLY the N post bodies separated by `---`. No intro line. Start directly with the first post's hook."
- Keep the existing `truncateToPostCount` call.

### Out of scope

- No change to the Outbound page, `approvals` table, or auto-send settings.
- No change to `SendPlanButton` or the plan-filing path.
- No change to email/reminder intent handling.

### Verification

- Ask CEO chat: "write 2 linkedin posts about X". Confirm reply contains 2 post bodies, the "Add 2 posts to Outbound" button shows, clicking it toasts "Added 2 posts" and two pending rows appear on `/outbound`.
- Ask: "one more post". Confirm authoring flag still triggers (previous assistant was LinkedIn) and button appears.
- Regression: normal Q&A replies still show no Outbound button.
