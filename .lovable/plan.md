## Plan: make file reading reliable for single chat and swarm

### Goal
Fix the case shown in the screenshot where an attached PDF/deck has no selectable text, causing the agent to say it cannot read the document.

### What I will change
1. **Add OCR fallback for PDFs with no extracted text**
   - Keep the current fast text extraction path for normal text PDFs.
   - If PDF extraction returns empty/near-empty text, render PDF pages to images and run OCR on them server-side.
   - Store the OCR result in `ceo_chat_attachments.extracted_text` so both single chat and swarm reuse the same readable content.

2. **Add better fallback for image-heavy decks**
   - For `.pptx`, keep the current slide XML text extraction.
   - If slide text is empty, mark the attachment clearly as image-heavy instead of silently providing unusable text.
   - If feasible in the runtime, add slide image/OCR extraction; otherwise route image-based deck/PDF pages through multimodal model input where supported.

3. **Make image-based attachments work in both paths**
   - Single chat already passes `imageParts` to the selected model; I will ensure PDFs/decks that become page images are treated similarly when OCR is unavailable.
   - Swarm already has `imageParts` support; I will extend it to include generated page/slide image URLs or OCR text from the same attachment rows.

4. **Improve attachment status/error text**
   - Replace `[no extracted text available]` style messages with explicit statuses such as:
     - `OCR extracted text from image-based PDF`
     - `No selectable text found; sent pages as images to vision-capable models`
     - `No readable content could be extracted`
   - This prevents the agent from incorrectly claiming no file was attached.

5. **Validate with the failing scenario**
   - Test a text PDF, image-only PDF/deck, image attachment, and normal docx/pptx/xlsx.
   - Verify single chat and swarm both receive readable attachment context and quality breakdown still renders.

### Technical notes
- I will keep all LLM calls on the existing OpenRouter path through `src/lib/llm.server.ts`.
- I will not import server-only modules into client files.
- I will avoid changing the existing swarm quality breakdown behavior except where attachment context is passed into it.
- If the server runtime cannot safely render PDFs to images directly, I will implement the best supported fallback: page-image multimodal routing and clearer attachment errors, rather than adding a Node-only package that would break deployment.