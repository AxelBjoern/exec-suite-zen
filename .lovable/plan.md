# Fix: chat replies with preamble but no post bodies

## What's actually happening

The assistant reply in your screenshot was literally:

```
Here are two fresh posts on the same theme — distinct angles, same core message.


---
```

Preamble + a stray `---` divider, then nothing. That's why "Add to Outbound" has nothing to file — the model never produced the post bodies. Two root causes combine:

1. **Token truncation.** `runChatWithWebTools` calls `chatCompletion` with `DEFAULT_MAX_TOKENS = 8000`, and Grok 4.3 spends a large budget on hidden reasoning before writing output. When it runs out mid-generation, we get exactly this shape: intro sentence + first divider + cut-off.
2. **Retry guards don't catch this shape.** In `src/serverfns/ceo-chat.functions.ts`:
   - `splitPosts` filters chunks by `length >= 20`, so "Here are two…" (≈60 chars) counts as **1 post**, and the "under-delivered" retry at line 1341 fires — but the retry runs with the same 8k cap and often truncates again.
   - The preamble guard at line 1369 requires `reply.trim().length < 400` AND a "here are/sure/okay" prefix. A reply that's 401 chars, or starts with "Below are…" or "I've drafted…", slips through.
   - Both retries call `runChatWithWebTools`, which keeps `WEB_TOOLS` enabled — the model can burn its budget on a tool call and again run out of tokens before writing posts.

## Fix

Edit `src/server/llm.server.ts`:
- No signature change needed; `chatCompletion` already accepts `max_tokens`.

Edit `src/serverfns/ceo-chat.functions.ts`:
1. Add an optional `max_tokens` and `disableTools` param to `runChatWithWebTools`, forwarded to `chatCompletion`. When `disableTools` is set, skip the tools/tool_choice fields entirely (don't just no-op the loop).
2. For the **initial** LinkedIn authoring call, pass `max_tokens: 16000` so a 2-post reply (≈2×1600 chars + reasoning) fits comfortably.
3. Rewrite the under-delivered / preamble guard into one block that runs after the first call:
   - Compute `bodies = splitPosts(reply)` **after stripping** a leading preamble paragraph (first block before the first blank line that matches `/^(here (are|is)|below (are|is)|sure|okay|got it|i(?:'|)ve (drafted|written)|check (these|this) out)/i`, or a paragraph shorter than 200 chars that contains no hashtag and no sentence-ending punctuation typical of a post hook).
   - Also treat as under-delivered when the reply ends with a bare `---` and has fewer than `postCount` bodies of `length >= 200`, OR when total reply length < `postCount * 300`.
   - When under-delivered, retry up to **2 times** with `disableTools: true`, `max_tokens: 16000`, temperature 0.4, and a stricter instruction: "Return ONLY the N post bodies separated by a line containing only `---`. No intro, no meta, no `### Post` headers. Start with the first post's hook. Each post 800–1600 chars with 3–6 hashtags."
   - After retries, `truncateToPostCount` as today.
4. Remove the now-redundant separate preamble guard (lines 1368–1394) — the unified guard replaces it.

Also relax `splitPosts` in `src/server/chat-intent.server.ts`:
- Raise the per-chunk minimum from `length >= 20` to `length >= 120` so a lone "Here are two fresh posts…" preamble is no longer counted as a post. This makes the under-delivered check honest for every downstream caller (including `fileLinkedInDrafts`).

## Out of scope

- No changes to `MessageRow`, `AddToOutboundButton`, or `fileLinkedInDrafts` — the button already works once real bodies exist.
- No changes to intent detection or the outbound schema.
- No new models, no model swap; still Grok 4.3 (or whatever the user picked).

## Verification

- Ask "write me 2 LinkedIn posts about X" — reply contains 2 full bodies separated by `---`, and the button reads "Add 2 posts to Outbound".
- Ask "write me 1 LinkedIn post about Y" — single body, button reads "Add to Outbound".
- Regression: a normal (non-LinkedIn) reply still returns immediately without extra calls.
