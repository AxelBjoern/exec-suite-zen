# Fix: CEO chat can't see uploaded images

## Why this happens

When you attach a PNG/JPG, the upload handler runs `extracted_text` extraction. For images it hits the `else` branch and stores the literal string:

```
[Unsupported file type: image/png]
```

That string is the only thing injected into the prompt:

```
## Attached documents
### Screenshot 2026-05-27 025724.png
[Unsupported file type: image/png]
```

So the model is answering honestly — it was never sent the image, only a filename and an "unsupported" marker. Every selected model (Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, DeepSeek V4 Pro, Hermes 4 405B) supports vision via OpenRouter except Hermes; the bug is on our side, not the model's.

## Fix

Send images to the model as proper multimodal content parts (OpenAI/OpenRouter `image_url` format) instead of as a fake text blob.

### 1. `src/serverfns/ceo-chat.functions.ts` — `uploadCeoAttachment`
- Detect images (`mimeType.startsWith("image/")` or extension in `png|jpg|jpeg|webp|gif`).
- Skip the text-extraction branch for images; store `extracted_text = ""` (or null) so we don't pollute prompts with `[Unsupported file type...]`.
- Everything else (storage upload, row insert, size limits) stays.

### 2. `src/serverfns/ceo-chat.functions.ts` — `sendCeoMessage`
- When loading attachments, also select `mime_type` and `storage_path`.
- Split attachments into two groups:
  - **Text-like** (pdf/docx/txt/md): keep current behavior — append their `extracted_text` into `attachmentBlock`.
  - **Images**: for each, create a short-lived signed URL via `supabaseAdmin.storage.from("chat-uploads").createSignedUrl(storage_path, 3600)`. Collect into `imageParts`.
- Build the final user message for the model as multimodal when images exist:
  ```ts
  const userMessage = imageParts.length
    ? {
        role: "user",
        content: [
          { type: "text", text: data.content + attachmentBlock },
          ...imageParts.map(url => ({ type: "image_url", image_url: { url } })),
        ],
      }
    : { role: "user", content: data.content + attachmentBlock };
  ```
- Pass this through where the current code sends the user turn to `chatCompletion`. History stays plain text (saved DB messages are text-only); only the live turn carries images.
- Saved `userContentSaved` (DB row) stays plain text — the image is already linked via `ceo_chat_attachments.message_id`, so the UI bubble already renders the thumbnail.

### 3. `src/server/llm.server.ts`
- Widen `ChatMessage` to allow multimodal content:
  ```ts
  export type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low"|"high"|"auto" } }
    >;
  };
  ```
- No other changes — OpenRouter forwards the array as-is.

### 4. Hermes guard (small UX polish)
- Hermes 4 405B has no vision endpoint. If `data.model` resolves to `nousresearch/hermes-4-405b` and `imageParts.length > 0`, throw a clear error before the call: *"Hermes 4 405B can't read images. Pick Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, or DeepSeek V4 Pro to analyze attached images."* (Matches the existing "no fallback models" rule in memory.)

## Out of scope
- `@board` / `@mention` dispatch still sends text-only prompts to sub-agents. Images attached alongside a `@board` message will still be invisible to the boardroom. We can extend dispatch later if you want; this fix targets the direct CEO chat path the screenshot shows.
- No DB schema change. `extracted_text` becoming empty for images is forward-compatible with existing rows.
- No UI changes — image thumbnails in chat bubbles already work.

## Verification
1. Upload a PNG, ask "what's in this image?" with Grok 4.3 / Claude Opus 4.7 / GPT 5.3 / DeepSeek V4 Pro selected → model describes it.
2. Try with Hermes selected → clean error message, no opaque 400 from OpenRouter.
3. Upload a PDF → still summarized via text extraction (regression check).
4. Mixed (PDF + PNG in same turn) → both reach the model.
