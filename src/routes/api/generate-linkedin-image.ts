// Streaming LinkedIn image generation through Lovable AI Gateway.
// Image pixels go through AI Gateway (the only image endpoint Lovable exposes);
// LLM calls remain on OpenRouter per project memory.
import { createFileRoute } from "@tanstack/react-router";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/images/generations";

export const Route = createFileRoute("/api/generate-linkedin-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          tagline?: string;
          visualPrompt?: string;
        };
        const tagline = (body.tagline ?? "").trim();
        const visual = (body.visualPrompt ?? "").trim();
        if (!tagline || !visual) return new Response("Missing tagline/visualPrompt", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const prompt =
          `${visual}. Bold sans-serif overlay text that reads exactly: "${tagline}". ` +
          `Composition leaves negative space for the text. High contrast, social-share friendly, square 1:1, no watermarks, no logos.`;

        const upstream = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-image-2",
            prompt,
            quality: "low",
            size: "1024x1024",
            n: 1,
            stream: true,
            partial_images: 1,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text(), { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
