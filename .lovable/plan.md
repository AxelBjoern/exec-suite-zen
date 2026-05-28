## Goal

Fix the `401 Unauthenticated` error from Replicate by switching Kling v3.0 Std video generation to OpenRouter (the same gateway already used for all chat models, per project memory).

## Changes

**`src/serverfns/video.functions.ts`**
- Remove `REPLICATE_API_TOKEN` + Replicate prediction polling (`startPrediction`, `fetchPrediction`, `extractOutputUrl`).
- Call OpenRouter's video endpoint with `OPENROUTER_API_KEY` (already set in secrets):
  - `POST https://openrouter.ai/api/v1/video/generations`
  - Headers: `Authorization: Bearer $OPENROUTER_API_KEY`, `Content-Type: application/json`
  - Body: `{ model: "kwaivgi/kling-v3.0-std", prompt, duration: 5 }`
- Download the returned MP4 URL, then keep the existing flow unchanged: ElevenLabs narration (parallel), upload both to `chat-uploads`, insert `ceo_chat_attachments`, return signed URLs.
- Error messages keep the label "Kling v3.0 Std" (per the 7-model rule).

**No other files change.** `ceo-chat.functions.ts`, the `/video` slash command, narration UI, and the model picker stay as-is.

## Technical notes

- OpenRouter exposes video models through a video-generation route distinct from `/chat/completions`. The existing `llm.server.ts` already declares Kling as a video model and rejects it from chat — that guard stays.
- If OpenRouter returns the video as a hosted URL, we still fetch the bytes server-side so they live in Supabase storage (same as today).
- No new secrets needed; `OPENROUTER_API_KEY` is already configured. `REPLICATE_API_TOKEN` becomes unused (left in secrets, can be deleted later).

## Open question

I'll verify OpenRouter's exact video endpoint shape (`/video/generations` vs a `/chat/completions` variant with `modalities: ["video"]`) when I implement, since their video API is newer. If it returns async job IDs instead of a direct URL, I'll add a short poll loop equivalent to the current Replicate one.
