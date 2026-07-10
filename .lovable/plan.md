## Goal
After saving a GitHub PAT, immediately probe a private repo the user names and confirm read access in the same UI action.

## Changes

**1. `src/server/user-github.server.ts`** — add `testUserRepoAccess(userId, repoUrl)`:
- Parse `owner/repo` from a full GitHub URL (strip `.git`, trailing slash).
- Load the user's decrypted token (`getUserGithubToken`).
- Call `GET /repos/{owner}/{repo}` and `GET /repos/{owner}/{repo}/contents` (root) via `gh()` from `github.server.ts`.
- Return `{ ok, private, defaultBranch, fileCount, error? }` — never throw for 4xx; return a clean error string (401/403/404 mapped to friendly hints).

**2. `src/lib/user-github.functions.ts`** — add `testMyRepoAccess` server function (auth-gated) wrapping the helper. Also extend `saveMyGithubToken` to accept optional `testRepoUrl` and return `{ status, test }` in one round-trip.

**3. `src/routes/_authenticated/settings/connections.tsx`** — in `GithubCard`:
- Add an optional **"Test repo URL"** input (persists in `localStorage` as `vdnx.gh.testRepo`) shown next to the token field with placeholder `https://github.com/owner/repo`.
- On **Save token**, pass the test URL. On success show a green inline result: `✓ Read access confirmed — private repo, N files at root (main)`. On failure show a red inline result with the mapped hint (e.g. "Token valid but repo not visible — grant this repo to the fine-grained PAT").
- Add a **"Test again"** button (visible when connected) that calls `testMyRepoAccess` without re-saving.

## Notes
- Read-only: uses only `GET` endpoints — respects the VDNX read-only GitHub rule.
- No schema changes.
- Existing token save flow keeps working if the test URL is left blank (test is skipped, previous behavior).
