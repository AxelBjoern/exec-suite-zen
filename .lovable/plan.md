# Artifact Panel for Generated Documents

Make `/pdf` and `/docx` outputs from the CEO agent open in a slide-in panel from the right — like Claude/Grok artifacts — instead of just a download link in the message.

## What the user gets

- Assistant message keeps a short summary + outline, but the "📄 Title" becomes a clickable **artifact pill** ("Open document · PDF · 124 KB").
- Clicking it slides a panel in from the right (overlays chat, chat stays mounted underneath).
- Panel header: title, subtitle, kind badge, Download button, Copy link, Close (×).
- Panel body:
  - PDF → inline `<iframe>` of the public URL (native browser PDF viewer).
  - DOCX → embedded Office Online viewer (`view.officeapps.live.com/op/embed.aspx?src=...`) with a "Download .docx" fallback button if the embed fails.
- Width: ~640px on desktop, full-screen on mobile. Closable via ×, Esc, or clicking the chat area.
- Old messages (link-only, no artifact metadata) still work — we parse the existing download URL/title out of the markdown as a fallback so historical docs also open in the panel.

## Implementation

### 1. Persist artifact metadata on the message

Migration on `ceo_chat_messages`:
```sql
alter table public.ceo_chat_messages
  add column if not exists artifact_json jsonb;
```

Shape stored:
```ts
{
  kind: "pdf" | "docx",
  title: string,
  subtitle?: string,
  filename: string,
  url: string,
  sizeKB: number,
  createdAt: string
}
```

### 2. `src/serverfns/ceo-chat.functions.ts`

In `generateCeoDocument`, when inserting the assistant reply, also set `artifact_json` with the metadata above. Keep the markdown reply unchanged so the outline still renders. Make sure `getCeoChat` selects `artifact_json` so the client receives it.

### 3. New component `src/components/ArtifactDrawer.tsx`

- Uses `Sheet` from `@/components/ui/sheet` (`side="right"`, custom width `sm:max-w-[640px] w-full`).
- Props: `{ open, onOpenChange, artifact }`.
- Renders header (title, kind chip, Download/Copy/Close) and body (iframe for PDF, Office viewer for DOCX).
- Reuses existing tokens (`border-rule`, `bg-panel`, `font-serif`, `font-mono`, `text-primary`) — matches the terminal/ceo aesthetic, no new colors.

### 4. `src/routes/index.tsx` chat rendering

- Add `const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null)`.
- For each assistant message, compute `artifact = m.artifact_json ?? parseArtifactFromMarkdown(m.content)` (small regex helper that picks out the `[Download … (… KB)](url)` line + the bold title).
- If `artifact`, render a pill button above/below the outline:
  ```
  [📄 Quarterly Plan · PDF · 124 KB · Open]
  ```
  Clicking it sets `openArtifact`.
- Render `<ArtifactDrawer open={!!openArtifact} onOpenChange={...} artifact={openArtifact} />` once at the page root.
- Keep the existing markdown body so the download link still appears as a secondary path.

### 5. Auto-open on creation (optional, low-risk)

When `genDoc.mutate` resolves with a new assistant message that has `artifact_json`, immediately set `openArtifact` so the panel slides in as soon as the doc is ready — same UX as Claude/Grok.

## Out of scope

- No changes to terminal artifacts (`ArtifactCard`), model selector, agent prompts, or doc generation content/format.
- No artifact list sidebar (can be added later); only the per-message pill + drawer.
- No editing of docs inside the panel — view + download only.
