// Server-only LinkedIn image generator. Non-streaming variant for the chat
// auto-file path — returns a single base64 PNG so it can be attached to the
// outbound payload immediately. The streaming /api/generate-linkedin-image
// route is still used by the /outbound UI for live previews.

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/images/generations";

export async function generateLinkedInImageBase64(opts: {
  tagline: string;
  visualPrompt: string;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const tagline = opts.tagline.trim();
  const visual = opts.visualPrompt.trim();
  if (!tagline || !visual) throw new Error("tagline and visualPrompt required");

  const prompt =
    `${visual}. Bold sans-serif overlay text that reads exactly: "${tagline}". ` +
    `Composition leaves negative space for the text. High contrast, social-share friendly, square 1:1, no watermarks, no logos.`;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt,
      quality: "low",
      size: "1024x1024",
      n: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn image gen failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const b64 = json?.data?.[0]?.b64_json;
  if (b64) return b64;

  // Fallback: if the gateway returned a URL instead of b64, fetch and encode.
  const url = json?.data?.[0]?.url;
  if (url) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`Image URL fetch failed: ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    return buf.toString("base64");
  }
  throw new Error("Image gateway returned no image data");
}
