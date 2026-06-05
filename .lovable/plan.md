## Goal

Make the app comfortable to use on a phone (the PWA target) and make moving between the **Chat (CEO)** view and the **Terminal** view fast on any screen size.

Today:
- `/` (Chat) is already mostly mobile-ready (drawer sidebar, responsive header, drag/drop). Small polish needed.
- `/terminal` is **desktop-only**: 224px fixed roster sidebar, horizontal tab bar, a 176px scrollback panel, plus a ticker — all stacked, so on a 390px phone the active panel is squeezed to almost nothing and the roster blocks half the screen.
- Navigating between the two views requires hunting: only an arrow icon in the chat sidebar header and a small "Chat with CEO →" link inside the Roster panel.

## Plan

### 1. Mobile-optimize `/terminal` (`src/components/Terminal.tsx`)

- **Roster aside** → hidden on mobile (`hidden md:flex`); add a `Menu` button in the header that opens it as a left drawer with a backdrop, same pattern as `/` (translate-x transition, click-outside to close, auto-close on agent select).
- **Header** → tighten padding on mobile (`px-3 py-2 md:px-5 md:py-3`), drop the "Authority · Auditability · Atomicity" tagline below `md`, shrink clock to icon-only / wrap below title.
- **Tabs row** → already `overflow-x-auto`; add `scrollbar-hide`, snap-x, and make each tab `whitespace-nowrap text-[11px] md:text-[12px]` with a thicker tap target (`py-2.5`).
- **Scrollback panel** → reduce from fixed `h-44` to `h-28 md:h-44`, and add a collapse toggle button (chevron in its top-right) that stores state in `useState`; collapsed = `h-8` showing just the last line.
- **Command line** → keep visible, but stack `⌘K` button hidden on mobile (palette can still be opened via long-press of the input or a dedicated `+` button), enlarge tap target on the input (`py-3 text-[14px]`), `inputMode="text"` and `autoCapitalize="off"`.
- **Audit ticker** → hide on mobile (`hidden md:block`) to free vertical space; user can open `/audit` panel for the full log.
- **ThreadPanel right aside** (Mandate/Tone/Consult/Directives) → on mobile, collapse into a single expandable `<details>` block above the messages instead of a 288px side rail; on `md+` keep current layout.
- **AgentsPanel grid** → already `grid-cols-1 md:grid-cols-2`; reduce padding from `p-8` → `p-4 md:p-8` and font sizes one step on mobile.
- **AuditPanel table** → on mobile, render rows as stacked cards (the current 4-column grid overflows).
- Apply the same `p-4 md:p-8` padding pass to Tasks/Approvals/Leads/Manual panels.

### 2. Improve chat ↔ terminal navigation

- **Chat header (`/`)** → add a visible "Terminal" pill button next to the model selector (icon + label on `md+`, icon-only on mobile) that links to `/terminal`. Today the only link is the back-arrow in the sidebar header, which isn't discoverable.
- **Terminal header (`/terminal`)** → add a matching "Chat" pill button next to the clock that links to `/`. Today the only entry point is buried inside the Roster panel.
- Both buttons use `Link` from `@tanstack/react-router`, `aria-label`, and the existing button styles — no new components.

### 3. Chat sidebar polish (`src/routes/index.tsx`)

- On mobile, surface the "New conversation" button as a sticky bottom-left FAB inside the chat panel (visible when sidebar is closed) so starting a new chat doesn't require opening the drawer first.
- Make conversation rows' rename/delete buttons always visible on touch devices (currently `md:opacity-0 md:group-hover:opacity-100` — fine, but add `opacity-100 md:opacity-0` so they appear by default on mobile).
- Auto-close sidebar after `newConvoMutation` success on mobile.

### 4. Viewport / safe area

- In `src/routes/__root.tsx` head, ensure the viewport meta includes `viewport-fit=cover` so the PWA respects iPhone notch insets.
- Add `pb-[env(safe-area-inset-bottom)]` to the chat input bar and the terminal command line so they don't sit under the iOS home indicator.

### Out of scope

- No changes to server functions, agent logic, AI models, or data shape.
- No redesign of message bubbles, artifacts, or the command palette behavior — only sizing and discoverability.
- No new routes.

### Files touched

- `src/components/Terminal.tsx` (largest change — mobile shell + drawer + panel polish)
- `src/routes/index.tsx` (Terminal link in header, FAB, sidebar polish)
- `src/routes/__root.tsx` (viewport meta `viewport-fit=cover`)
- Possibly `src/styles.css` for a small `.scrollbar-hide` utility if not present
