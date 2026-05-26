// GitHub read-only helpers for syncing VDNX agents with the live VDNX repo.
// Server-only. Reads GITHUB_TOKEN and VDNX_REPO (format: "owner/repo") from env.

const API = "https://api.github.com";
const MAX_FILE_CHARS = 8000;

function repo(): string {
  const r = process.env.VDNX_REPO;
  if (!r || !r.includes("/")) {
    throw new Error('VDNX_REPO env var missing or malformed. Expected "owner/repo".');
  }
  return r;
}

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN missing.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "VDNX-Agent-Bridge",
  };
}

async function gh(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) throw new Error(`GitHub 404: ${path}`);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`GitHub auth failed (${res.status}). Check GITHUB_TOKEN scopes for ${repo()}.`);
    }
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function listRepoDir(path = ""): Promise<{ path: string; entries: { name: string; path: string; type: string; size?: number }[] }> {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const data = await gh(`/repos/${repo()}/contents/${encodeURI(clean)}`);
  if (!Array.isArray(data)) {
    // It's a file, not a directory
    return { path: clean, entries: [{ name: data.name, path: data.path, type: data.type, size: data.size }] };
  }
  return {
    path: clean,
    entries: data.map((d: any) => ({ name: d.name, path: d.path, type: d.type, size: d.size })),
  };
}

export async function readRepoFile(path: string): Promise<{ path: string; content: string; truncated: boolean; size: number }> {
  const clean = path.replace(/^\/+/, "");
  if (!clean) throw new Error("path is required");
  const data = await gh(`/repos/${repo()}/contents/${encodeURI(clean)}`);
  if (Array.isArray(data)) throw new Error(`${clean} is a directory, not a file`);
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new Error(`Unexpected GitHub response for ${clean}`);
  }
  const raw = Buffer.from(data.content, "base64").toString("utf8");
  const truncated = raw.length > MAX_FILE_CHARS;
  const content = truncated ? raw.slice(0, MAX_FILE_CHARS) + `\n\n…[truncated; ${raw.length - MAX_FILE_CHARS} more chars]` : raw;
  return { path: clean, content, truncated, size: data.size ?? raw.length };
}

export async function searchRepoCode(query: string): Promise<{ query: string; matches: { path: string; snippet?: string }[] }> {
  const q = `${query} repo:${repo()}`;
  const data = await gh(`/search/code?q=${encodeURIComponent(q)}&per_page=10`);
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    query,
    matches: items.map((it: any) => ({
      path: it.path,
      snippet: it.text_matches?.[0]?.fragment ?? undefined,
    })),
  };
}
