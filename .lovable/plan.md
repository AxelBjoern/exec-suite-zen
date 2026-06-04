## 1. Fix markdown rendering (root cause of the screenshot)

The attached screenshot shows GitHub-style tables (`| col | col |`) being dumped as raw pipe text. That's because `ReactMarkdown` in `MessageRow` (src/routes/index.tsx ~line 1052) has no GFM plugin, so tables, task lists, strikethrough, and autolinks all fall back to plain text.

- `bun add remark-gfm`
- In `src/routes/index.tsx`, import `remarkGfm` and pass `remarkPlugins={[remarkGfm]}` to `<ReactMarkdown>`.
- Style tables explicitly inside the `prose` block so they render readably regardless of viewport:
  - Wrap markdown output in `overflow-x-auto` so wide tables scroll instead of overflowing the chat.
  - Tailwind typography classes: `prose-table:my-4 prose-table:w-full prose-table:text-sm prose-th:bg-muted/60 prose-th:font-semibold prose-th:text-left prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:align-top prose-td:border-t prose-td:border-border/50 prose-thead:border-b prose-thead:border-border`.

## 2. Improve overall chat readability

Still in `MessageRow` / transcript container in `src/routes/index.tsx`:

- Assistant prose: `prose-sm` → `prose` with `text-[15px] leading-7`, `prose-p:my-3`, `prose-li:my-1`, `prose-headings:mt-5 prose-headings:mb-2`, `prose-ul:my-3 prose-ol:my-3`.
- Widen transcript: `max-w-3xl` → `max-w-[46rem]`. Increase turn spacing `space-y-8` → `space-y-10`.
- Code blocks: `prose-pre:rounded-lg prose-pre:p-3 prose-pre:text-[13px]`; inline code `prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none` (kills the stray backticks the typography plugin adds).
- Long-word wrap: keep `break-words`, add `overflow-wrap-anywhere` via `[overflow-wrap:anywhere]` so URLs and long tokens don't blow out the column.
- User bubble: `text-sm` → `text-[15px] leading-6`, cap at `max-w-[80%]`, keep `rounded-2xl rounded-br-sm`.
- Subtle separation between consecutive assistant turns with a faint `border-t border-border/40 pt-6` on every assistant row after the first (apply via index-based class in the map).

Purely visual; no behavior change.

## 3. Auto-name new chats (~3 words)

In `src/serverfns/ceo-chat.functions.ts`:

- New helper `generateConvoTitle(userText, assistantText)` calling `chat()` (existing `llm.server.ts`) with `google/gemini-3.5-flash` and prompt: *"Return ONLY a 2–4 word title (Title Case, no quotes, no trailing punctuation) summarizing this conversation."*
- Sanitize: trim, strip quotes/punctuation, clamp to 4 words / 60 chars; fallback to existing derivation on junk.
- In the main send-message handler (and `/search`, `/fetch`, `/repo` variants), after the assistant message is saved, if the conversation's current `title` is the placeholder (`"New conversation"`) **or** matches the auto-derived first-user-message slug **and** message count == 2, update `ceo_conversations.title` via `supabaseAdmin`. Wrapped in try/catch so naming never breaks the reply.
- Client picks it up via existing `qc.invalidateQueries(["ceo-conversations"])`.

## 4. Auto-navigate to new conversation

In `src/routes/index.tsx`:

- `newConvoMutation` already calls `setActiveId(convo.id)`. Strengthen:
  - `onMutate`: clear input, attachments, and `pendingFor` so the new convo opens on a clean slate immediately.
  - `onSuccess`: also scroll transcript and sidebar list to top.
- First-message-in-fresh-session path: `setActiveId(serverConvoId)` as soon as the mutation resolves so the sidebar highlights the new convo without waiting for the refetch (already mostly there — make unconditional).

## Technical notes

- Title model: `google/gemini-3.5-flash` (already in `MODEL_SLUGS`). No new model deps.
- New dep: `remark-gfm` only.
- Placeholder-title detection: `"New conversation"` OR equals the first ≤80 chars of the first user message.
- No schema changes; reuses `ceo_conversations.title` and existing rename pattern.
- Single `/` route preserved; no threaded URL routing in this change.