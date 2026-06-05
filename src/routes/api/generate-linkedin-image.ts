// Streaming LinkedIn image generation through Lovable AI Gateway.
// Image pixels go through AI Gateway (the only image endpoint Lovable exposes);
// LLM calls remain on OpenRouter per project memory.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDesignRulesForUser } from "@/server/designRules.server";

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/images/generations";

async function resolveUserFromAuth(request: Request) {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data } = await supabaseAdmin.auth.getUser(token);
  return data?.user ?? null;
}

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

        // Pull per-user design rules (VDNX defaults for axel@natax.co.uk)
        let designRules: string | null = null;
        try {
          const user = await resolveUserFromAuth(request);
          if (user) {
            designRules = await getDesignRulesForUser({ userId: user.id, email: user.email });
          }
        } catch { /* non-fatal */ }

        const rulesBlock = designRules ? `\n\nBrand/style rules (must follow):\n${designRules}` : "";

        const prompt =
          `${visual}. Bold sans-serif overlay text that reads exactly: "${tagline}". ` +
          `Composition leaves negative space for the text. High contrast, social-share friendly, square 1:1, no watermarks, no logos.` +
          rulesBlock;

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
