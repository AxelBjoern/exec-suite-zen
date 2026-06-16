# Give agents the ability to read public GitHub repos

## Goal
Agents in `src/server/agent-tools.server.ts` currently have `web.search` and `web.fetch` but no first-class GitHub read. The VDNX bridge in `src/server/github.server.ts` already implements `listRepoDir`, `readRepoFile`, and `searchRepoCode`, but they require `GITHUB_TOKEN` and a single hard-coded repo. We'll loosen that and surface it as three agent tools that work on any public `owner/repo` (and continue to authenticate when a token is available, for private repos and higher rate limits).

## Changes

### 1. `src/server/github.server.ts` — allow unauthenticated public reads
- Make `headers()` return `Authorization` only when `GITHUB_TOKEN` is set; always send `Accept` / `User-Agent` / API version headers.
- Keep `defaultRepo()` / `normalizeRepo()` behavior: an explicit `owner/repo` (or GitHub URL) wins; falling back to `VDNX_REPO` only happens when no repo is passed.
- Rewrite the `gh()` 401/403 message so it distinguishes "rate-limited / private repo without token" from "bad token".

### 2. `src/server/agent-tools.server.ts` — register three tools
All `readOnly: true`, `allowedAgents: "*"`, audit-logged via existing `executeToolCall` path.

- `github.list_dir` — `{ repo: string, path?: string }` → calls `listRepoDir(path, repo)`.
- `github.read_file` — `{ repo: string, path: string }` → calls `readRepoFile(path, repo)` (already truncates at ~8k chars).
- `github.search_code` — `{ repo: string, query: string }` → calls `searchRepoCode(query, repo)`. Note: GitHub's code search endpoint requires authentication; if `GITHUB_TOKEN` is unset, return `{ error: "code search requires GITHUB_TOKEN" }` instead of throwing, so the agent can fall back to `list_dir` + `read_file`.

`repo` accepts `"owner/repo"` or a full `github.com/...` URL (already handled by `normalizeRepo`). The existing `zodToJsonSchema` covers `z.string()` + `z.string().optional()` so no schema changes needed.

Add the three tool consts to the `TOOL_REGISTRY` array.

### 3. No new dependencies, no migrations, no UI changes
- Honors the read-only GitHub constraint from `mem://index.md` (only `contents` GET and `search/code` GET).
- Tool calls are audited in `tool_calls` like every other tool.

## Out of scope
- Writing/PR creation (forbidden by core memory).
- Repo discovery / org listing.
- Caching layer — GitHub's own ETags + the existing 8k truncation are enough for now.

## Verification
After build, an agent prompt like *"list the top-level files of `facebook/react` and read `package.json`"* should result in two tool calls (`github.list_dir`, `github.read_file`) and a coherent answer, with no token required.
