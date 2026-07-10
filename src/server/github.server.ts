// GitHub read-only helpers for syncing VDNX agents with the live VDNX repo.
// Server-only. Reads GITHUB_TOKEN and VDNX_REPO (format: "owner/repo") from env.

const API = "https://api.github.com";
const MAX_FILE_CHARS = 8000;

function defaultRepo(): string {
  const r = process.env.VDNX_REPO;
  if (!r || !r.includes("/")) {
    throw new Error('No repo specified and VDNX_REPO env var missing/malformed. Use "owner/repo".');
  }
  return r;
}

function normalizeRepo(repo?: string | null): string {
  const r = (repo ?? "").trim();
  if (!r) return defaultRepo();
  // Accept full GitHub URLs.
  const m = r.match(/github\.com\/([^/]+\/[^/?#]+)/i);
  const slug = (m ? m[1] : r).replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!/^[^/]+\/[^/]+$/.test(slug)) {
    throw new Error(`Invalid repo "${repo}". Expected "owner/repo" or a GitHub URL.`);
  }
  return slug;
}

function headers(explicitToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "VDNX-Agent-Bridge",
  };
  const token = explicitToken || process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh(path: string, repoForError?: string, token?: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: headers(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      const hint = token
        ? `Your personal GitHub token can't see ${repoForError ?? "this repo"} (or it doesn't exist).`
        : `Repo ${repoForError ?? "target"} not found. If it's private, add a personal GitHub token in Settings → Connections.`;
      throw new Error(`GitHub 404: ${hint}`);
    }
    if (res.status === 401 || res.status === 403) {
      const hasToken = !!(token || process.env.GITHUB_TOKEN);
      const hint = hasToken
        ? `GitHub rejected the token for ${repoForError ?? "this repo"} — check scopes (needs 'repo' or fine-grained Contents:Read).`
        : `Unauthenticated request rejected. Add a personal GitHub token in Settings → Connections to read private repos.`;
      throw new Error(`GitHub ${res.status}: ${hint}`);
    }
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function listRepoDir(path = "", repo?: string, token?: string): Promise<{ repo: string; path: string; entries: { name: string; path: string; type: string; size?: number }[] }> {
  const slug = normalizeRepo(repo);
  const clean = path.replace(/^\/+|\/+$/g, "");
  const data = await gh(`/repos/${slug}/contents/${encodeURI(clean)}`, slug, token);
  if (!Array.isArray(data)) {
    return { repo: slug, path: clean, entries: [{ name: data.name, path: data.path, type: data.type, size: data.size }] };
  }
  return {
    repo: slug,
    path: clean,
    entries: data.map((d: any) => ({ name: d.name, path: d.path, type: d.type, size: d.size })),
  };
}

export async function readRepoFile(path: string, repo?: string, token?: string): Promise<{ repo: string; path: string; content: string; truncated: boolean; size: number }> {
  const slug = normalizeRepo(repo);
  const clean = path.replace(/^\/+/, "");
  if (!clean) throw new Error("path is required");
  const data = await gh(`/repos/${slug}/contents/${encodeURI(clean)}`, slug, token);
  if (Array.isArray(data)) throw new Error(`${clean} is a directory, not a file`);
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new Error(`Unexpected GitHub response for ${clean}`);
  }
  const raw = Buffer.from(data.content, "base64").toString("utf8");
  const truncated = raw.length > MAX_FILE_CHARS;
  const content = truncated ? raw.slice(0, MAX_FILE_CHARS) + `\n\n…[truncated; ${raw.length - MAX_FILE_CHARS} more chars]` : raw;
  return { repo: slug, path: clean, content, truncated, size: data.size ?? raw.length };
}

export async function searchRepoCode(query: string, repo?: string, token?: string): Promise<{ repo: string; query: string; matches: { path: string; snippet?: string }[] }> {
  const slug = normalizeRepo(repo);
  const q = `${query} repo:${slug}`;
  const data = await gh(`/search/code?q=${encodeURIComponent(q)}&per_page=10`, slug, token);
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    repo: slug,
    query,
    matches: items.map((it: any) => ({
      path: it.path,
      snippet: it.text_matches?.[0]?.fragment ?? undefined,
    })),
  };
}

// Verify a user-supplied PAT and return the account info + granted scopes.
export async function verifyGithubToken(token: string): Promise<{ login: string; scopes: string[] }> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub token check failed (${res.status}): ${body.slice(0, 160) || "invalid token"}`);
  }
  const scopesHeader = res.headers.get("x-oauth-scopes") ?? "";
  const scopes = scopesHeader.split(",").map((s) => s.trim()).filter(Boolean);
  const data = await res.json();
  return { login: String(data?.login ?? ""), scopes };
}

// Parse "owner/repo" or "owner/repo/some/path" (or a github.com URL) into { repo, path }.
export function parseRepoTarget(input: string): { repo: string; path: string } {
  const s = input.trim();
  const urlMatch = s.match(/github\.com\/([^/]+)\/([^/?#]+)(?:\/(?:tree|blob)\/[^/]+)?\/?(.*)/i);
  if (urlMatch) {
    return { repo: `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/i, "")}`, path: (urlMatch[3] ?? "").replace(/[?#].*$/, "") };
  }
  const parts = s.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length < 2) throw new Error(`Invalid repo target "${input}". Use "owner/repo[/path]".`);
  return { repo: `${parts[0]}/${parts[1]}`, path: parts.slice(2).join("/") };
}

