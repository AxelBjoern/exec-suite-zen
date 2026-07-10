## Fix: chat says "Repo inaccessible" while settings test succeeds

**Root cause:** In `src/serverfns/ceo-chat.functions.ts` the `hasGithubUrl` branch passes the raw suffixed slug (e.g. `AxelBjoern/natax-sales-nexus-a3c1d323`) to the LLM with only a "if private you'll get 404" hint. Settings' test works because it eagerly probes and falls back to the alias (`natax-sales-nexus`). The chat leaves alias resolution up to the model, which refuses instead of retrying.

## Change

Edit `src/serverfns/ceo-chat.functions.ts` around the current lines 1401–1411 (`repoHint` block). When `hasGithubUrl && ghToken`:

1. Parse the pasted URL, probe `/repos/{slug}` server-side. On 404, call `findReadableRepoAlias` (already exported) and pivot to the resolved slug. Track an `aliasNote` string.
2. Eagerly fetch a root `listRepoDir` + first README via `readRepoFile` on the resolved slug (mirrors `/repo` overview). Cap README at 4000 chars.
3. Inject a new `system` message `repoOverview` alongside the existing `repoHint`, with an explicit line: **"You HAVE read access to this repo (confirmed above). NEVER say the repo is inaccessible."**
4. On fetch failure, inject the real error text and instruct the model to report it verbatim instead of a generic refusal.
5. Update `repoHint` to point the LLM at the **resolved** slug for any deeper tool calls.

No changes to schemas, UI, or other files. `resolveReadableRepo` continues to backstop tool calls the model makes on the pasted slug.

## Verification

- Paste `https://github.com/AxelBjoern/natax-sales-nexus-a3c1d323` in the CEO chat → expect executive overview grounded in the real repo (root listing + README excerpt), not "Repo inaccessible."
- Without a saved token, behavior is unchanged (existing hint still shown).
- Real 401/404 from GitHub surfaces the exact reason instead of a refusal.
