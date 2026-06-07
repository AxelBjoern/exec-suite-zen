## 1. Fix scheduled date/time for LinkedIn (and email)

**Bug:** `<input type="datetime-local">` returns `YYYY-MM-DDTHH:mm` with no timezone. `Date.parse()` on the Worker treats that as UTC, so a user in BST/CET scheduling "14:00" actually fires at 14:00 UTC (1–2 h late/early). Same string is also written straight to the DB.

**Fix:**
- Client: convert the local datetime to a real ISO string with the browser's offset before sending — `new Date(localStr).toISOString()` (the `Date` constructor parses `YYYY-MM-DDTHH:mm` as local time). Apply in `outbound.tsx` for email, reminder, LinkedIn submit and inside the edit modal save.
- Server: in `outbound.functions.ts` tighten `ScheduledAt` to require a full ISO with `Z`/offset (`z.string().datetime({ offset: true })`), and in `isFutureSchedule` keep the existing parse — now it'll be correct.
- Cron (`scheduled-outbound.ts`): no change needed once strings are real ISO, but add a guard that skips rows whose `scheduled_at` is missing tz info to avoid mixing old + new rows.
- Display: show queued items' `scheduled_at` formatted in the user's local time so they can verify.

## 2. PDF carousel upload (LinkedIn document post, max 10 pages)

LinkedIn "carousel posts" = a PDF shared via `feedshare-document` recipe, rendered as swipeable pages.

- UI (LinkedIn card + edit modal): add a "PDF carousel" file input (`accept=".pdf"`, single file, ≤ 10 MB). Client uses `pdfjs-dist` (already common) — actually simpler: parse page count server-side. Just enforce ≤ 10 MB client-side and base64-encode.
- Schema: extend `LinkedInReq` payload with optional `pdfBase64` (max ~10 MB base64) and `pdfFilename`. Mutually exclusive with `imageBase64` + video.
- Sender (`postLinkedInAsWorkspace`): when `pdfBase64` present:
  1. Reject if PDF > 10 pages (parse with `pdf-lib` — Worker-safe).
  2. `registerUpload` with recipe `urn:li:digitalmediaRecipe:feedshare-document`.
  3. PUT bytes (Content-Type `application/pdf`).
  4. POST `ugcPosts` with `shareMediaCategory: "DOCUMENT"`, media entry includes `title: pdfFilename`.
- List strip: replace `pdfBase64` with `"[pdf]"` like images.

## 3. Video: upload + Kling AI generation

- UI (LinkedIn card + edit modal):
  - "Upload video" button (`accept="video/mp4"`, ≤ 200 MB — LinkedIn cap; client warns if >50 MB).
  - "Generate with Kling" button + prompt textarea — reuses `generateCeoVideo` logic but inline (no chat conversation). Refactor: extract a `generateKlingClip(prompt)` helper in a new `src/lib/video.functions.ts` server fn returning `{ videoBase64, mimeType }` (or a signed URL from `chat-uploads`). Outbound stores the resulting bytes on the approval row.
- Schema: extend `LinkedInReq` with optional `videoBase64` + `videoFilename` + `videoMimeType`. Validate exactly one of {image, pdf, video} is set.
- Sender: when `videoBase64` present:
  1. `registerUpload` with `urn:li:digitalmediaRecipe:feedshare-video`.
  2. PUT bytes with `Content-Type: video/mp4`.
  3. Poll asset status until `AVAILABLE` (LinkedIn requires this for video, unlike images) — short bounded loop (≤ 60 s).
  4. POST `ugcPosts` with `shareMediaCategory: "VIDEO"`.
- Cron sender (`scheduled-outbound.ts`): mirror the same pdf/video branches in `postLinkedIn`.
- Storage: large base64 in the `approvals.payload` JSON is wasteful. Move media to the existing `chat-uploads` bucket under `outbound/{approvalId}/...` and store only `{ kind, path, filename, mime }` in payload. Sender resolves path → bytes at send time. Migration: none (bucket exists, RLS already covers admin client).

## 4. Models / cost

Kling v3.0 Std stays the only video model (matches core rule). No new chat models. Image generation path unchanged.

## Files touched

- `src/routes/_authenticated/outbound.tsx` — schedule conversion, PDF + video UI in main card and edit modal, local-time display.
- `src/lib/outbound.functions.ts` — schema, mutual-exclusion validation, sender branches (PDF doc, video), local→ISO already done client-side, payload now references storage paths.
- `src/routes/api/public/cron/scheduled-outbound.ts` — same branches as sender.
- `src/lib/video.functions.ts` (new) — `generateKlingClip` server fn returning a storage path to a generated mp4 (reuses `chat-uploads`).
- `src/lib/tagline.functions.ts` — unchanged.
- Add `pdf-lib` dependency (Worker-safe, pure JS) for server-side page count check.

## Open question

For "carousel pdf 10 max" I'm reading it as: one PDF, max 10 pages, posted as a LinkedIn document carousel (this is how LinkedIn does carousels natively). If you instead meant "up to 10 separate images posted as a multi-image carousel", say so and I'll swap the LinkedIn document path for `shareMediaCategory: "IMAGE"` with up to 10 media entries.