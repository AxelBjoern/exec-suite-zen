# Per-user GitHub read access

Right now the chat only sees repos the workspace `GITHUB_TOKEN` can read (that's why `AxelBjoern/natax-sales-nexus-a3c1d323` came back as "no context" — it's private and outside VDNX_REPO's scope). Fix: let each signed-in user attach their own GitHub Personal Access Token, and have the GitHub helpers prefer that token when the caller is authenticated.

## What we'll build

1. **Table `user_github_tokens`** (Cloud migration)
   - `user_id uuid PK` → `auth.users`
   - `token_ciphertext text` (encrypted with `GITHUB_TOKEN_ENC_KEY` via `pgsodium`-style AES-GCM in a server helper — we'll use Node `crypto` in the server fn, not pgsodium, to keep it simple)
   - `token_hint text` (last 4 chars, for UI)
   - `scopes text[]`, `login text`, `created_at`, `updated_at`
   - RLS: user can only select/insert/update/delete their own row. GRANTs to `authenticated` + `service_role`.

2. **Secret** `GITHUB_TOKEN_ENC_KEY` (generated, 64-char) for at-rest encryption of PATs.

3. **Server helpers** `src/server/user-github.server.ts`
   - `saveUserGithubToken({ userId, token })` → validates via `GET /user`, stores scopes + login + last-4, encrypts token.
   - `getUserGithubToken(userId)` → decrypts and returns raw token or null.
   - `deleteUserGithubToken(userId)`.

4. **Wire into `src/server/github.server.ts`**
   - `headers()` becomes `headers(token?)`; accept an explicit token param through `listRepoDir` / `readRepoFile` / `searchRepoCode` / `parseRepoTarget` flows.
   - Add a thin `withUserToken(userId, fn)` wrapper used by the chat tools: resolves user PAT, falls back to `GITHUB_TOKEN`.
   - Keep read-only guarantee — no new write endpoints (respects core memory rule).

5. **Chat tool loop (`src/server/code-context.server.ts` + `src/serverfns/ceo-chat.functions.ts`)**
   - Pass `userId` from `requireSupabaseAuth` context into the tool executors so `list_vdnx_dir` / `read_vdnx_file` / `search_vdnx_code` use the user's PAT.
   - Extend intent detection: when the prompt contains a `github.com/<owner>/<repo>` URL, parse it via `parseRepoTarget` and target that repo (not just VDNX). Add a `repo` arg to each tool schema (optional, defaults to VDNX_REPO).
   - If the user has no PAT and the target repo 404/403s, return a friendly message telling them to add a PAT in Settings → Connections.

6. **UI: Settings → Connections** (`src/routes/_authenticated/settings/connections.tsx`)
   - New card "GitHub (personal)" alongside Gmail/LinkedIn.
   - Server fns: `getUserGithubStatus`, `saveUserGithubToken`, `deleteUserGithubToken`.
   - Input for `ghp_…` / `github_pat_…`, "Save", "Disconnect". Show `login`, scopes, and last-4 when connected.
   - Link to GitHub PAT docs with recommended scope: `repo` (or fine-grained "Contents: Read" for chosen repos).

## Out of scope
- No write / push / PR endpoints for user tokens (still forbidden by core rule).
- No org-wide OAuth app — PAT only for now; we can upgrade later.

## Result
Ask in chat: "read https://github.com/AxelBjoern/natax-sales-nexus-a3c1d323" → tools use axel's PAT, fetch the repo, ground the analysis in real files. Other users are unaffected and still see only what their own PAT (or the workspace token) allows.
