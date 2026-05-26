
# Sync VDNX agents with the VDNX codebase

Goal: when you give a task to any VDNX agent (CEO, CTO, etc.), the agent can read the actual VDNX repo so its output stays in sync with the real code — no manual pasting.

## Approach

Use the **GitHub API** as the source of truth. Both projects live in the same GitHub account, so one Personal Access Token (PAT) with `repo` scope gives the agents read access to the VDNX repo (and any other repo you own).

Defaults chosen (you can override anytime):
- **Source**: GitHub API, repo configurable (default `VDNX`)
- **Scope**: CTO + CEO agents get code access; others can opt in later
- **Trigger**: Automatic via tool-calling — the agent decides when to fetch files, plus an explicit `/code <path-or-query>` command for predictable injection

## What gets built

1. **Secret**: store `GITHUB_TOKEN` (your PAT, `repo` read scope) + `VDNX_REPO` (e.g. `your-username/vdnx`).
2. **Server helper** `src/server/github.server.ts` with three functions:
   - `listRepoTree(path)` — directory listing
   - `readRepoFile(path)` — file contents (base64 decoded)
   - `searchRepoCode(query)` — GitHub code search across the repo
3. **Agent tools** wired into the existing OpenRouter tool-calling loop (`src/lib/agent-schemas.ts` + dispatch in `src/serverfns/ceo-chat.functions.ts`):
   - `read_vdnx_file({ path })`
   - `list_vdnx_dir({ path })`
   - `search_vdnx_code({ query })`
   The model calls these when it needs context; results are fed back as tool messages before it emits the final artifact.
4. **Explicit command**: `/code <path>` in the terminal pre-fetches a file and pastes it into the prompt context — useful when you already know what file matters.
5. **Per-agent gating**: only CTO and CEO get the tools attached by default. Toggle others in `agent-prompts.ts` role config.
6. **Prompt update**: small addition to the CTO/CEO identity blocks telling them the tools exist and when to use them ("if the operator references a file, feature, or bug in VDNX, fetch the relevant source before responding").

## Technical details

- GitHub REST endpoints used: `GET /repos/{owner}/{repo}/contents/{path}` and `GET /search/code?q={q}+repo={owner}/{repo}`.
- Tool results are truncated to ~8k chars per file to control token cost; the agent can request more by path.
- All calls are server-side only (`*.server.ts`), token never reaches the browser.
- No DB schema changes needed.
- Failures (token missing, file not found, rate limit) are returned as structured tool errors so the model can recover or surface them.

## What you need to provide before build

- A GitHub PAT with `repo` scope (classic) or a fine-grained token with **Contents: Read** on the VDNX repo. I'll request it via the secret tool once you approve this plan.
- The exact repo slug (`owner/name`) if it isn't literally `VDNX`.

## Out of scope (call out if you want them)

- Writing to the VDNX repo from agents (kept read-only by design — matches VDNX's "AI drafts, humans authorize" principle).
- Two-way sync where edits in this project push to VDNX.
- Snapshot/caching layer (can add later if GitHub rate limits become an issue).
