// Slice 2 — Auto router. Cheap classifier that decides whether an incoming
// user message should be handled by a single fast model or escalated to the
// swarm. Used only when the user picks "Auto" in the chat mode toggle;
// default "Single" behavior is byte-identical to before.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatCompletion } from "@/server/llm.server";

export type RouteDecision = {
  mode: "single" | "swarm";
  reason: string;
};

const SYSTEM = `You are a routing classifier for a chat product.

Given a single user message, decide whether it should be answered by:
- "single": one fast model. Use for greetings, small talk, simple lookups,
  short factual Q&A, quick code snippets, single-doc summaries, translations,
  and anything that a strong single model handles well in one shot.
- "swarm": a parallel multi-agent swarm. Use for hard strategy, multi-perspective
  analysis, board-level decisions, tradeoff comparisons, competitive analysis,
  long-form original writing (essays, plans, playbooks), or requests that
  explicitly ask for multiple viewpoints / "brainstorm N options" / "pros and cons".

Return STRICT JSON — no prose, no code fences — matching:
{"mode":"single"|"swarm","reason":"<8-12 word rationale>"}`;

export const classifyChatMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { content: string }) => {
    if (typeof input?.content !== "string") throw new Error("content required");
    const c = input.content.trim();
    if (!c) throw new Error("content empty");
    return { content: c.slice(0, 4000) };
  })
  .handler(async ({ data }): Promise<RouteDecision> => {
    try {
      const res: any = await chatCompletion({
        model: "deepseek/deepseek-v4-flash",
        temperature: 0,
        max_tokens: 100,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: data.content },
        ],
      });
      const raw: string = res?.choices?.[0]?.message?.content ?? "";
      // Strip stray fences just in case.
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("no json");
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      const mode = parsed?.mode === "swarm" ? "swarm" : "single";
      const reason = typeof parsed?.reason === "string" && parsed.reason.length
        ? parsed.reason.slice(0, 140)
        : (mode === "swarm" ? "Multi-perspective task" : "Simple direct request");
      return { mode, reason };
    } catch {
      // Safe default: single mode (no behavior change vs today).
      return { mode: "single", reason: "Router unavailable — defaulted to single" };
    }
  });
