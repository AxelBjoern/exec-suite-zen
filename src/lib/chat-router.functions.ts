// Auto-mode router: given the user's prompt (+ attachment hints) and a list
// of candidate models, pick ONE model that's best suited. Uses DeepSeek V4
// Flash as the router (per memory core rule). Never affects the swarm path.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatCompletion, resolveTextChatModel } from "@/server/llm.server";

const ROUTER_MODEL = "deepseek/deepseek-v4-flash";

type Candidate = { id: string; label: string; description?: string | null };

type RouterInput = {
  prompt: string;
  hasAttachments: boolean;
  candidates: Candidate[];
};

const SYSTEM = `You are a model router. Given a user prompt and a list of candidate models, choose the ONE model best suited to answer well and efficiently.

Rules:
- Prefer smaller/faster models for short, casual, or classification-style prompts.
- Prefer stronger reasoning models for complex analysis, code, math, or multi-step work.
- If the prompt involves an attached document/image, prefer a multimodal-capable model when obvious from the label/description.
- Return ONLY compact JSON: {"model":"<id>","reason":"<one short sentence>"}. No prose outside JSON.`;

export const routeAutoModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as RouterInput;
    if (!v || typeof v.prompt !== "string" || !Array.isArray(v.candidates)) {
      throw new Error("Invalid input");
    }
    return {
      prompt: v.prompt.slice(0, 4000),
      hasAttachments: !!v.hasAttachments,
      candidates: v.candidates.slice(0, 40),
    } satisfies RouterInput;
  })
  .handler(async ({ data }) => {
    if (data.candidates.length === 0) {
      return { model: null as string | null, reason: "No candidate models configured" };
    }
    if (data.candidates.length === 1) {
      return { model: data.candidates[0].id, reason: "Only one candidate available" };
    }

    const catalogue = data.candidates
      .map((c) => `- ${c.id} — ${c.label}${c.description ? ` (${c.description})` : ""}`)
      .join("\n");
    const userMsg = `USER PROMPT:\n${data.prompt}\n\nATTACHMENTS: ${data.hasAttachments ? "yes" : "no"}\n\nCANDIDATE MODELS:\n${catalogue}\n\nReturn JSON now.`;

    try {
      const json = await Promise.race([
        chatCompletion({
          model: resolveTextChatModel(ROUTER_MODEL),
          temperature: 0.1,
          max_tokens: 200,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userMsg },
          ],
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("router timeout")), 20_000)),
      ]);
      const raw = json?.choices?.[0]?.message?.content?.trim() ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("router: non-json response");
      const parsed = JSON.parse(match[0]);
      const picked = String(parsed?.model ?? "").trim();
      const valid = data.candidates.find((c) => c.id === picked);
      if (!valid) {
        return {
          model: data.candidates[0].id,
          reason: "Router picked unknown model — fell back to first candidate",
        };
      }
      const reason = typeof parsed?.reason === "string" ? parsed.reason.slice(0, 200) : "";
      return { model: valid.id, reason };
    } catch (e: any) {
      return {
        model: data.candidates[0].id,
        reason: `Router error (${e?.message ?? "unknown"}) — fell back to first candidate`,
      };
    }
  });
