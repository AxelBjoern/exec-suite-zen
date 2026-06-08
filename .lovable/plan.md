## Goal

Make the `/agents-models` setup wizard flow smoother for non-axel users:

1. After creating the first agent (Step 1 → Step 2), auto-prefill the model form with a default preset and scroll to it.
2. Add a clear "Use preset" CTA on the model step that prefills the form and visually highlights the required fields.
3. Persist wizard selections (agent + model drafts) in `localStorage` so a refresh resumes with the same prefilled values.

Scope is frontend-only — single file: `src/routes/_authenticated/agents-models.tsx`. No DB, no server fn, no schema changes.

## Changes

### 1. Auto-advance Step 1 → Step 2
- Watch `hasOwnAgent`. When it flips from `false` → `true` and the wizard is still mounted, automatically:
  - Call `onPrefillModel(MODEL_PRESETS[0])` (DeepSeek V4 Flash) so the model form is prefilled.
  - Smooth-scroll to `modelFormRef`.
- Guard with a ref flag so it only fires once per session (user can still pick a different preset).

### 2. Model preset CTA + required-field highlight
- `ModelForm` accepts a new `highlightRequired: boolean` prop (true when prefill was just applied).
- When true, the required inputs (`name`, `slug`) get a ring/border-primary accent that fades after first edit or ~3s via `useEffect` timer.
- Wizard model-step cards already have "Use preset" — keep behavior, but make the primary preset (DeepSeek) visually emphasized (filled button vs outline) since it's auto-selected on advance.

### 3. Draft persistence across refresh
- New `localStorage` keys scoped to user: `am-wizard-draft-agent:${userId}` and `am-wizard-draft-model:${userId}`.
- On `onPrefillAgent` / `onPrefillModel`, write JSON to the matching key.
- On `AgentsModelsShell` mount, hydrate `agentPrefill` / `modelPrefill` from those keys (only when user is non-axel and doesn't already own one).
- `AgentForm` / `ModelForm`: on every field change, update the draft in localStorage (debounced via simple `useEffect` on state).
- On successful create (`onSuccess` of the mutation), clear the matching draft key.
- On wizard dismiss, clear both draft keys alongside the existing dismissed flag.

## Technical notes

- Keep the existing `AgentDraft` / `ModelDraft` types as the storage shape.
- Hydration must be SSR-safe: guard `window` access (route already has `ssr: false`, so a simple `typeof window` check is enough).
- Auto-advance effect lives inside `SetupWizard` and uses `useRef<boolean>` to avoid firing on the same render twice or after dismissal.
- No new dependencies, no route changes, no migration.

## Out of scope

- Server-side draft sync.
- Changes to axel's view (wizard already hidden for VDNX owner).
- Changes to delete/list behavior or RLS.
