// Internet access via Firecrawl (REST v2). Server-only.
// Reads FIRECRAWL_API_KEY from env.

const BASE = "https://api.firecrawl.dev/v2";

function key(): string {
  const k = process.env.FIRECRAWL_API_KEY;
  if (!k) throw new Error("FIRECRAWL_API_KEY missing — connect Firecrawl in Connectors.");
  return k;
}

async function fc(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("Firecrawl credits exhausted. Top up to keep using web access.");
    if (res.status === 401) throw new Error("Firecrawl key invalid. Reconnect Firecrawl in Connectors.");
    throw new Error(`Firecrawl ${path} failed (${res.status}): ${t.slice(0, 300)}`);
  }
  return res.json();
}

export type WebSearchResult = {
  url: string;
  title?: string;
  description?: string;
};

export async function webSearch(query: string, limit = 6): Promise<WebSearchResult[]> {
  const json = await fc("/search", { query, limit });
  // Firecrawl v2: results may live under data.web or data depending on version.
  const root = json?.data ?? json;
  const arr: any[] = Array.isArray(root?.web) ? root.web : Array.isArray(root) ? root : [];
  return arr.slice(0, limit).map((r) => ({
    url: r.url,
    title: r.title,
    description: r.description ?? r.snippet,
  }));
}

export type WebFetchResult = {
  url: string;
  title?: string;
  description?: string;
  markdown: string;
};

export async function webFetch(url: string): Promise<WebFetchResult> {
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  const json = await fc("/scrape", {
    url: target,
    formats: ["markdown"],
    onlyMainContent: true,
  });
  const d = json?.data ?? json;
  const md: string = d?.markdown ?? "";
  const meta = d?.metadata ?? {};
  return {
    url: meta.sourceURL ?? target,
    title: meta.title,
    description: meta.description,
    markdown: md.slice(0, 20_000),
  };
}

export function extractUrls(text: string): string[] {
  const re = /\bhttps?:\/\/[^\s<>"')]+/gi;
  return Array.from(new Set(text.match(re) ?? []));
}
