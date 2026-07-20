## Plan

1. **Show all user-added models in Swarm settings**
   - Replace the hardcoded swarm model list with models read from `base_models` where `swarm_eligible = true`.
   - Keep the VDNX legacy/default models only as rows from the database, not as the only allowed swarm options.
   - Make per-agent model pickers use the same dynamic list, so newly added swarm-enabled models appear immediately.

2. **Stop blocking custom models with the legacy allowlist**
   - Update swarm config validation so user-added model slugs are accepted when they exist in the model library and are marked swarm-eligible.
   - Preserve the existing 2-model minimum, max parallel setting, per-role agent setup, and synthesizer behavior.

3. **Fix edit/remove controls on Agents & Models**
   - Current UI only shows delete for rows owned by the logged-in user, and edit clones non-owned defaults.
   - For your VDNX owner/admin account, allow direct edit/delete of system/default model rows where backend permissions allow it.
   - For non-owner users, keep safe behavior: defaults can be cloned, only owned rows can be removed.

4. **Fix the disabled Swarm checkbox for owner/admin rows**
   - Let the VDNX owner/admin toggle `swarm_eligible` on default/system models directly.
   - Keep the checkbox disabled for non-owned rows for ordinary users.

5. **Verify**
   - Check that `/agents-models` shows custom models like `kimi`, `grok-4.5`, `chat 5.6`, and `glm-5.2` in the model list.
   - Check that those same swarm-enabled models appear in the Swarm per-agent dropdown.
   - Check that edit/delete/toggle actions are available for rows the current user is allowed to manage.