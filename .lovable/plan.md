## Problem
Settings already confirms the pasted repo `AxelBjoern/natax-sales-nexus-a3c1d323` maps to the readable private repo `AxelBjoern/natax-sales-nexus`, but chat still lets the model treat the pasted slug as a separate missing repo and asks for confirmation.

## Fix plan
1. **Make alias resolution authoritative**
   - When a pasted repo returns 404 but `findReadableRepoAlias` finds a readable match, treat the pasted repo as an alias, not as a failure.
   - The chat should proceed with the resolved repo automatically.

2. **Stop the model from re-litigating the pasted slug**
   - Move/duplicate the live repo context instruction after conversation history so it overrides old assistant messages.
   - Add an explicit rule: `AxelBjoern/natax-sales-nexus-a3c1d323` is an accepted alias for `AxelBjoern/natax-sales-nexus`; do not ask for confirmation.

3. **Filter stale wrong repo replies**
   - Extend the stale-history filter to remove previous assistant messages saying:
     - “does not exist”
     - “only repo that exists”
     - “cannot be scanned”
     - “confirm we should analyze the clean repo”
   - Only filter these when live saved-token repo context is confirmed.

4. **Fix agent GitHub tools too**
   - Update `github.list_dir`, `github.read_file`, and `github.search_code` to use the signed-in user’s saved GitHub token via `owner_user_id`.
   - Update descriptions from “public repo” to “GitHub repo readable with saved token”.

5. **Keep read-only guarantees**
   - No push, commit, PR, branch, or mutating GitHub API calls.
   - Only read endpoints remain enabled.

## Expected result
You can paste `AxelBjoern/natax-sales-nexus-a3c1d323`, and chat will automatically analyze `AxelBjoern/natax-sales-nexus` using your saved token without claiming the pasted repo is wrong or asking you to confirm.