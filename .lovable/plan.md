## Why the 404 happens

The "Chat with CEO →" link in `src/components/Terminal.tsx` (line 385) points to `href="/chat"`, but no `/chat` route exists. The CEO chat lives at `/` (`src/routes/index.tsx`). Clicking the link navigates to `/chat`, which has no matching route file, so the router renders the 404 boundary.

## Fix

In `src/components/Terminal.tsx`:

1. **Remove** the "Chat with CEO →" anchor from the top header (lines 384–389). Leave the clock in the header on the right.

2. **Move it next to the "Executive Team" header** inside `AgentsPanel` (around line 601). Wrap the existing `<h1>` and the new link in a flex row so they sit side-by-side, vertically centered:

   ```tsx
   <div className="flex items-center justify-between gap-4 mb-1">
     <h1 className="font-serif text-3xl">The Executive Team</h1>
     <Link
       to="/"
       className="smallcaps text-[20px] text-muted-foreground hover:text-primary border border-rule px-5 py-2 rounded-sm transition-colors"
     >
       Chat with CEO →
     </Link>
   </div>
   ```

3. **Size increase ~100%**: original was `text-[10px]` with `px-2.5 py-1`. Doubled to `text-[20px]` with `px-5 py-2`.

4. **Fix the destination**: use TanStack Router's `<Link to="/">` (already imported in the file via `@tanstack/react-router`) instead of a raw `<a href="/chat">`, so it navigates to the actual CEO chat route at `/` and benefits from client-side routing.

## Out of scope

- No changes to the chat route itself.
- No changes to other header items (logo, tagline, clock).
- No changes to AgentsPanel cards below the header.