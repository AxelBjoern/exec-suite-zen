## Goal
Make LinkedIn video generation on `/outbound` actually finish, remove the hard 7-minute cutoff, and surface real failures instead of silently spinning until nothing is attached.

## What I’ll change

### 1) Remove the client-side time limit
- Replace the hardcoded `7:00` timeout in `src/routes/_authenticated/outbound.tsx`.
- Keep polling until the job reaches a terminal state: `completed`, `failed`, or user-cancelled.
- Change the progress UI from `elapsed / 7:00` to an open-ended elapsed timer plus status text.

### 2) Stop hiding backend poll errors
- Fix `pollKlingJob` in `src/lib/outbound.functions.ts` so non-OK poll responses are not treated as `processing`.
- Return explicit failure details when OpenRouter polling fails, when download fails, or when storage upload/signing fails.
- Make the UI show the real error immediately instead of timing out later.

### 3) Make completed videos reliably reusable
- Ensure completed jobs don’t depend on a single successful client poll to become visible.
- Reuse an already-uploaded stored video path if the same job was completed earlier.
- Keep the generated video attached as `mediaPath` so preview/edit/send all use the stored asset consistently.

### 4) Fix the edit/preview flow for generated video
- Ensure the edit modal hydrates generated video from storage every time.
- Keep native `<video controls>` visible in both the edit popup and the row preview modal.
- If a job failed or never attached media, show a clear inline status instead of an empty media area.

### 5) Tighten the outbound submit path
- Verify the LinkedIn request payload always prefers `mediaPath` for generated clips.
- Preserve existing media during draft saves unless the user explicitly replaces/removes it.
- Keep image/PDF behavior unchanged.

## Validation
- Generate a new clip from the main LinkedIn card.
- Confirm the timer runs without a fixed cap.
- Confirm the finished clip appears inline with video controls.
- Save the draft, reopen it, and verify the video still previews in the popup.
- Confirm the row Preview button opens the stored clip.

## Technical details
- Files: `src/lib/outbound.functions.ts`, `src/routes/_authenticated/outbound.tsx`
- Main bug sources found in code:
  - `runKlingFlow()` still hard-stops after 7 minutes.
  - `pollKlingJob()` currently converts non-OK poll responses into fake `processing`, which can hide the actual failure.
  - If polling never reaches a successful attach, no `mediaPath` is saved, so the UI has nothing to preview later.

## Out of scope
- Muxing ElevenLabs audio into the MP4.
- Reworking the rest of outbound/email/reminder flows.