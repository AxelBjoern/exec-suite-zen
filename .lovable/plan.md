## Goal

Upgrade `/chat` with three things:

1. **Attach a document** to a message (PDF, DOCX, TXT, MD).
2. **Pick the model** for the conversation: Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, or **DeepSeek V4 Pro** — all routed through OpenRouter.
3. Default stays Hermes 4 405B (the current pipeline).

## UX changes (`/chat`)

- **Model dropdown** in the header next to "Clear", showing the active model. Selection persists in `localStorage` and is sent with every message.
- **Paperclip button** inside the composer, left of the textarea. Click → file picker (`.pdf,.docx,.txt,.md`, max ~10 MB, multiple allowed).
- Attached files render as small chips above the textarea (filename + size + "x" to remove).
- While files upload/extract, the send button shows a spinner.

## Backend

- **Storage bucket** `chat-uploads` (private). Server-only access via `supabaseAdmin`.
- **New table** `ceo_chat_attachments` (id, message_id → ceo_chat_messages, filename, mime_type, size_bytes, storage_path, extracted_text, created_at).
- **New server function** `uploadCeoAttachment({ filename, mimeType, base64 })`:
  - Uploads to `chat-uploads/<uuid>-<filename>`.
  - Extracts text — `.txt`/`.md` direct, `.pdf` via `unpdf`, `.docx` via `mammoth` (both Worker-compatible).
  - Truncates to ~30k chars.
  - Returns `{ id, storagePath, extractedText, filename }`.
- **`sendCeoMessage`** gets `model?: string` and `attachmentIds?: string[]`. It prepends a `## Attached documents` block (filename + extracted text) to the user message sent to the LLM, links attachments to the saved message, and forwards `model` to `chatCompletion()`.

## Model routing

`src/server/llm.server.ts` already accepts a `model` arg. Add a server-side allow-list mapping UI labels → OpenRouter slugs:

```text
Hermes (default)  → nousresearch/hermes-4-405b
Grok 4.3          → x-ai/grok-4
ChatGPT 5.3       → openai/gpt-5
Claude Opus 4.7   → anthropic/claude-opus-4.1
DeepSeek V4 Pro   → deepseek/deepseek-chat
```

Closest currently-live OpenRouter slugs are used — the exact version numbers you named (4.3 / 5.3 / 4.7 / V4 Pro) aren't published on OpenRouter today. UI labels keep your names; we update the slug map when newer versions appear. Unknown models are rejected server-side.

## Files touched

- `src/routes/chat.tsx` — model dropdown, file input, attachment chips, upload flow.
- `src/serverfns/ceo-chat.functions.ts` — `uploadCeoAttachment`, updated `sendCeoMessage`.
- `src/server/llm.server.ts` — model allow-list helper.
- New migration: `ceo_chat_attachments` table + `chat-uploads` storage bucket + policies.
- `package.json` — add `unpdf` and `mammoth`.

## Out of scope

- Image/vision input.
- Per-message model override (one active model per conversation).
- Re-running old messages against a new model.

## Open questions

1. OK to ship with the closest currently-available OpenRouter slugs (labels keep your names: Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, DeepSeek V4 Pro)?
2. Keep Hermes as the default, or default to one of the five picks?
