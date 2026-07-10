# Plan: Auto-attach VDNX repo context to chat

## Problem
The assistant has read-only VDNX repo tools (`list_vdnx_dir`, `read_vdnx_file`, `search_vdnx_code`) but the chat runtime doesn't surface them for prompts like "analyze the VDNX repo". The model responds asking for a "VDNX REPO CONTEXT block" because none is injected and it isn't invoking the tools itself.

## Changes

1. **`src/serverfns/ceo-chat.functions.ts`**
   - Detect VDNX-repo intent in the user message (keywords: `vdnx repo`, `vdnx code`, `vdnx source`, explicit paths like `src/…`).
   - When detected, ensure the VDNX code-context tools are enabled in the tool loop (currently gated) and add a system directive: "Use `list_vdnx_dir` / `read_vdnx_file` / `search_vdnx_code` to ground every claim. Never ask the user to paste repo context — fetch it yourself."

2. **`src/server/code-context.server.ts`**
   - Add a `getVdnxRepoOverview()` helper that reads `README.md`, `package.json`, and top-level `src/` listing in one call, cached per request.
   - Auto-inject the overview as a system message when VDNX intent is detected, so the model starts with real paths instead of guessing.

3. **Tool-loop nudge**
   - If the model's first draft contains phrases like "attach the repo", "no repo context", or "cannot analyze without", force a retry with a stricter directive and the overview pre-loaded.

## Out of scope
- No write access to VDNX (core memory rule).
- No UI changes.
- No new tables.

## Verification
- Ask "analyze the VDNX repo structure" → model calls `list_vdnx_dir` + `read_vdnx_file` and cites real paths.
- Ask "review src/App.tsx in VDNX" → model reads the file directly without prompting for a paste.
