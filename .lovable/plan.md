## Fix both issues in one pass

### A. LLM must actually output N separate posts when asked

Regression: since the outbound-classifier changes, the CEO turn sometimes short-circuits or the model returns a meta reply ("You've already written the three posts…") instead of the actual N drafts. Root causes in `src/serverfns/ceo-chat.functions.ts`:

1. `isLinkedInAuthoring` requires BOTH a post word AND an authoring verb. Prompts like "give me 3 for launch week" or "3 more" miss the verb list, so no `postCount` rule is injected. The model then produces one blob or a meta message.
2. The authoring rule is appended after `CEO_SYSTEM`, but the base system prompt has language that lets the model summarize/refuse. Need a stronger, top-level instruction that forces exactly N posts, separated by `---`, no meta commentary, no "here you go".
3. `truncateToPostCount` only *cuts* extras — it doesn't split a single blob into N. If the model returns one paragraph, we still file one row.

Fix:

- Broaden `isLinkedInAuthoring` detection: any of these triggers the rule
  - message mentions `post|posts|linkedin` AND parsePostCount ≥ 2
  - previous assistant message contained hashtags / `---` / `### Post` (was LinkedIn draft) AND the user asks for a number ("3 more", "another 2", "give me 5")
  - user message matches `\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(more\s+)?(linkedin|posts?|variants|drafts|options)\b`
- Prepend (not append) a hard LinkedIn authoring block to the system prompt, and make it explicit:

  ```
  === LINKEDIN AUTHORING (MANDATORY) ===
  Produce EXACTLY {N} full LinkedIn posts. No preamble, no meta commentary, no "here you go", no summary.
  Format:
  ### Post 1
  <full post body with hashtags>
  ---
  ### Post 2
  <full post body with hashtags>
  ---
  ...
  Every post must stand alone (hook + body + CTA + 3–6 hashtags), 800–1600 chars.
  If you cannot comply, output the posts anyway — never refuse or summarize.
  ```

- After the model returns, if we asked for N ≥ 2 but the reply has fewer than N `---`/`### Post` delimiters, retry ONCE with a stricter user instruction: *"You returned {actual} posts, I asked for {N}. Return exactly {N} posts separated by --- with '### Post K' headers. No other text."* Then re-run `truncateToPostCount`.

### B. Never file a meta reply to /outbound

When the user says "post these three", the outbound branch grabs the previous assistant message and files it. If that previous message is meta prose ("You've already written…", "To publish on LinkedIn: 1. Copy Post 1…"), we file garbage as shown in the screenshot.

Fix in the same file, LinkedIn `action==='file'` branch:

1. Walk `history` from newest to oldest and pick the most recent assistant message that looks like a real draft:
   - contains ≥ 1 hashtag (`#\w+`) OR a post delimiter (`\n---\n`, `### Post \d`, `**Post \d**`)
   - AND length ≥ 300 chars
   - AND does NOT match the meta blocklist: `^you['']?ve already`, `^here you go`, `^to publish`, `^copy post`, `^the posts are`, `^i can'?t`, `^as requested`, `^they'?re`
2. If no such message exists → do NOT file. Reply: `📨 I couldn't find the drafted posts in this thread. Say "redraft 3 posts about X" and I'll write them, then say "post these" to file.`
3. If found → run `splitPosts`; require ≥ 1 chunk of ≥ 200 chars with a hashtag or post delimiter to actually file; otherwise fall through to the same "couldn't find" reply.

### C. Copy button in chat

Preview iframe rejects `navigator.clipboard.writeText` (`NotAllowedError`) and the current `try/catch` in `src/lib/chat-helpers.ts` returns `false` without trying the fallback. Rewrite:

```ts
export async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
```

### Files touched
- `src/serverfns/ceo-chat.functions.ts` — broaden LinkedIn authoring detection, harden system prompt, one retry on under-count, real-draft guard on outbound filing.
- `src/lib/chat-helpers.ts` — copy fallback.

No schema / UI changes.
