## Add copy button under assistant answers

Under every assistant message in the CEO chat, show a small "Copy" button that copies the raw markdown of that reply to the clipboard, with a brief "Copied" confirmation.

### Scope

- Applies only to assistant messages (not user messages).
- Copies the original markdown `content` (what the model wrote), not the rendered HTML.
- Uses `navigator.clipboard.writeText` with a `document.execCommand("copy")` fallback.
- Toast confirmation via existing `sonner` toaster ("Copied to clipboard").
- Button is subtle: ghost icon button below the message, visible always (not hover-only), to match the existing minimal style.

### Files

- `src/routes/index.tsx` — update the `MessageRow` component:
  - Add a `Copy` / `Check` icon import from `lucide-react`.
  - Inside the assistant branch, render a footer row under the prose containing a copy button.
  - Local state for "copied" flag that flips for ~1.5s on click.

### Out of scope

- No copy button on user messages.
- No per-section copy (whole reply only).
- No persistence — copied state is ephemeral per render.
