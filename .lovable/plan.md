## What the error is

That blob is DeepSeek's native tool-call markup (`<｜DSML｜tool_calls>` / `<｜DSML｜invoke>` / `<｜DSML｜parameter>`) leaking into the assistant message as plain text. It happens because:

1. DeepSeek V4 emits tool calls in DSML syntax (using the special `｜` bar characters) when the OpenRouter endpoint doesn't route them as native `tool_calls`.
2. Our current `sanitizeModelText` in `src/serverfns/ceo-chat.functions.ts` only strips Hermes/Nous-style `<tool_call>…</tool_call>` and `<function=…>` fragments. It doesn't recognize the DSML tags, so they render verbatim in chat.
3. The model actually wanted to call `list_vdnx_dir` / `read_vdnx_file` against the repo — those tools exist, but the loop never sees them because they arrived as text, not as a `tool_calls` array.

## Fix plan (read-only, chat only)

1. **Extend `sanitizeModelText`** in `src/serverfns/ceo-chat.functions.ts`
   - Strip any `<｜DSML｜tool_calls>…</｜DSML｜tool_calls>` block (and stray `<｜DSML｜invoke>` / `<｜DSML｜parameter>` fragments) from the final visible content, same way we strip Hermes XML.
   - Handle both the special `｜` (U+FF5C) and the ASCII `|` variants defensively.

2. **Parse and execute leaked DSML calls before sanitizing**
   - Before returning content, detect DSML `invoke` blocks, convert each to `{ name, arguments }`, and feed them through the existing tool-execution loop (same path as native `tool_calls`), so `list_vdnx_dir` / `read_vdnx_file` actually run and the model gets a chance to answer using the results.
   - After execution, continue the normal loop until the model returns a clean natural-language reply.
   - If parsing fails, fall back to just stripping the block (step 1) so the user never sees raw markup.

3. **Streaming path**
   - Apply the same DSML detection + strip in `streamCeoMessage` so tokens containing DSML fragments don't flash in the UI mid-stream, and the final buffered text stays clean.

4. **No other behavior changes**
   - Keep repo alias resolution, sticky GitHub context, saved-token usage, and stale-history filter untouched.
   - Read-only: no new GitHub writes, no new tools, no schema changes.

## Expected result

The DSML blob disappears from chat. The model's intended calls to `list_vdnx_dir` and `read_vdnx_file` on `AxelBjoern/natax-sales-nexus` execute via your saved token, and you get a normal written answer instead of raw tool-call syntax.
