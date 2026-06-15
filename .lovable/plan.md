## Fix TSX Preview Runner

The TSX preview iframe throws `SyntaxError: Cannot use import statement outside a module` when user code contains `import` or `export` because `new Function()` executes in non-module script mode.

### Changes
1. **In `src/components/PreviewPane.tsx`** — update `buildTsxRunnerDoc`:
   - Add Babel plugin `transform-modules-commonjs` so `import`/`export` become `require`/`exports`.
   - Inject a `require(id)` shim into the `new Function` scope that resolves `'react'` and `'react-dom'` (and variants) to the already-loaded ESM modules.
   - Pass `ReactDOM` as a second parameter to `new Function` so the shim can return it.
   - Keep error handling and `App` / `export default` fallback logic unchanged.

No other files touched. No new dependencies — Babel standalone already includes the plugin.

### Security
- Still runs inside `<iframe sandbox="allow-scripts">` with no `allow-same-origin`. The shim only exposes React/ReactDOM; unknown imports throw a clear runtime error.
