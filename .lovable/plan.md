Problem
-------
The preview shows the raw HTML source as code instead of rendering it. The session's `preview_type` is `"markdown"` but the AI returned a full HTML document (`<!DOCTYPE html>...`) without a fenced code block, so `detectPreview` did not catch it and fell back to markdown. `MarkdownPreview` then displays the HTML as text.

Fix
---
In `src/components/PreviewPane.tsx`, auto-detect HTML content regardless of declared type:

1. Compute `looksLikeHtml = /^\s*(<!doctype\s+html|<html[\s>])/i.test(content)`.
2. Derive `effectiveType`: if declared type is `markdown` or `text` and `looksLikeHtml`, use `"html"` instead.
3. Use `effectiveType` everywhere in the render switch and for `isCodeLike` / `canRun` checks.

Result: the existing `HtmlPreview` iframe renders the page properly, with no other behavior changes.

Files
-----
- src/components/PreviewPane.tsx (single small edit)