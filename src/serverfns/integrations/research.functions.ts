import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Lightweight web-fetch grounding for SEO audits & sales discovery.
// No external API key required — uses native fetch + naive HTML extraction.

function strip(html: string) {
  return html.replace(/\s+/g, " ").trim();
}
function pick(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? strip(m[1]) : null;
}

export const fetchUrlSnapshot = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string; agent_slug?: string; task_id?: string }) => d)
  .handler(async ({ data }) => {
    let url = data.url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "VDNX-Research/1.0 (+lovable)" },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (e: any) {
      const err = `fetch failed: ${e.message}`;
      await supabaseAdmin.from("tool_calls").insert({
        agent_slug: data.agent_slug ?? null,
        task_id: data.task_id ?? null,
        tool: "research.fetch_url",
        request: { url },
        status: "error",
        error: err,
      });
      throw new Error(err);
    }

    const html = (await response.text()).slice(0, 250_000);
    const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)
      ?? pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);
    const ogTitle = pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
    const canonical = pick(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
      .slice(0, 5).map(m => strip(m[1].replace(/<[^>]+>/g, "")));
    const linkCount = (html.match(/<a\s+[^>]*href=/gi) || []).length;
    const imgCount = (html.match(/<img\s/gi) || []).length;
    const wordCount = strip(html.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")).split(/\s+/).length;

    const snapshot = {
      url,
      status: response.status,
      title,
      ogTitle,
      description,
      canonical,
      h1s,
      linkCount,
      imgCount,
      approxWordCount: wordCount,
      latencyMs: Date.now() - started,
    };

    await supabaseAdmin.from("tool_calls").insert({
      agent_slug: data.agent_slug ?? null,
      task_id: data.task_id ?? null,
      tool: "research.fetch_url",
      request: { url },
      response: snapshot,
      status: "ok",
    });

    return snapshot;
  });
