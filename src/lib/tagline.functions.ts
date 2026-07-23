import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callTool } from "@/lib/llm.server";

const TOOL = {
  type: "function" as const,
  function: {
    name: "compose_tagline",
    description: "Generate a short bold tagline and a visual prompt for a LinkedIn share image.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tagline: {
          type: "string",
          description: "Bold 4-8 word tagline that captures the post's core message. No quotes.",
        },
        visual_prompt: {
          type: "string",
          description:
            "1-2 sentences describing a strong visual concept: subject, mood, style, colors. No text overlay description — that's added separately.",
        },
      },
      required: ["tagline", "visual_prompt"],
    },
  },
};

const SYSTEM = `You are a senior brand designer composing a LinkedIn share image for a founder.
Given the post text, write:
1. A bold 4-8 word tagline (English) that is memorable and direct — sentence case, no period, no quotes.
2. A short visual concept for an image generator: subject, mood, style ("editorial photography", "abstract gradient", "isometric illustration", etc.), and a color palette. Modern, high-contrast, social-share friendly.

No emojis. No hashtags.`;

export const composeLinkedInTagline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ text: z.string().min(1).max(20000) }).parse(i))
  .handler(async ({ data }) => {
    const { result } = await callTool<{ tagline: string; visual_prompt: string }>({
      system: SYSTEM,
      user: `Post text:\n"""${data.text}"""`,
      tool: TOOL,
      toolChoice: { name: "compose_tagline" },
      model: "x-ai/grok-4.3",
    });
    return result;
  });
