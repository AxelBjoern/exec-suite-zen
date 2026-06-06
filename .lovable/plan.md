## Problem

The `/chat` page shows two vertical scrollbars: an outer page scrollbar and the inner message-list scrollbar.

Root cause: the chat root uses `h-screen` (100vh) and lives **below** the sticky `ModuleSwitcher` header inside `_authenticated/route.tsx` (which wraps content in `min-h-screen`). So total page height = header (~3.25rem) + 100vh, which overflows the viewport and produces the outer scrollbar.

## Change

Single edit, frontend only:

- **`src/routes/_authenticated/chat.tsx`** (line 590): replace the outer container class `h-screen bg-background text-foreground flex` with `h-[calc(100vh-3.25rem)] bg-background text-foreground flex`.

This matches the convention already used by `src/routes/_authenticated/index.tsx` and removes the outer scrollbar, leaving only the in-chat message scrollbar.

No other files, no logic changes.