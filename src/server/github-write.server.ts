// GitHub write helpers — used by Cowork "Apply & push to GitHub".
// Hard refuses VDNX_REPO; that one stays read-only per project memory.
// Server-only. Reads GITHUB_TOKEN.

const API = "https://api.github.com";

function normalizeRepo(repo: string): string {
  const r = (repo ?? "").trim();
  const m = r.match(/github\.com\/([^/]+\/[^/?#]+)/i);
  const slug = (m ? m[1] : r).replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!/^[^/]+\/[^/]+$/.test(slug)) throw new Error(`Invalid repo "${repo}". Expected "owner/repo".`);
  return slug;
}

export function assertNotVdnxRepo(repo: string): string {
  const slug = normalizeRepo(repo);
  const vdnx = (process.env.VDNX_REPO ?? "").trim().toLowerCase();
  if (vdnx && slug.toLowerCase() === vdnx) {
    throw new Error("Refusing to write to the VDNX repo — it is read-only.");
  }
  return slug;
}

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "VDNX-Cowork-Apply",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function gh(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const t = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} on ${method} ${path}: ${t.slice(0, 300)}`);
  }
  return res.status === 404 ? null : res.json();
}

export async function getRepoDefaultBranch(repo: string): Promise<string> {
  const slug = normalizeRepo(repo);
  const data = await gh("GET", `/repos/${slug}`);
  if (!data) throw new Error(`Repo ${slug} not found or token lacks access`);
  return data.default_branch as string;
}

async function getFileSha(repo: string, path: string, branch: string): Promise<string | null> {
  const slug = normalizeRepo(repo);
  const data = await gh("GET", `/repos/${slug}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
  if (!data || Array.isArray(data)) return null;
  return data.sha ?? null;
}

async function getBranchSha(repo: string, branch: string): Promise<string | null> {
  const slug = normalizeRepo(repo);
  const data = await gh("GET", `/repos/${slug}/git/refs/heads/${encodeURIComponent(branch)}`);
  if (!data) return null;
  return data.object?.sha ?? null;
}

async function createBranch(repo: string, branch: string, fromSha: string): Promise<void> {
  const slug = normalizeRepo(repo);
  await gh("POST", `/repos/${slug}/git/refs`, { ref: `refs/heads/${branch}`, sha: fromSha });
}

/** Push `content` to `path` on a new branch off the repo default, then open a PR. */
export async function applyContentAsPR(opts: {
  repo: string;
  path: string;
  content: string;
  commitMessage: string;
  prTitle?: string;
  prBody?: string;
}): Promise<{ branch: string; prUrl: string; commitSha: string }> {
  const slug = assertNotVdnxRepo(opts.repo);
  if (!opts.path || opts.path.startsWith("/")) throw new Error("path must be repo-relative, no leading slash");

  const base = await getRepoDefaultBranch(slug);
  const baseSha = await getBranchSha(slug, base);
  if (!baseSha) throw new Error(`Cannot read base branch ${base}`);

  const branch = `cowork/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await createBranch(slug, branch, baseSha);

  const existingSha = await getFileSha(slug, opts.path, base);
  const put = await gh("PUT", `/repos/${slug}/contents/${encodeURI(opts.path)}`, {
    message: opts.commitMessage.slice(0, 200),
    content: Buffer.from(opts.content, "utf8").toString("base64"),
    branch,
    sha: existingSha ?? undefined,
  });
  const commitSha = put?.commit?.sha ?? "";

  const pr = await gh("POST", `/repos/${slug}/pulls`, {
    title: (opts.prTitle ?? opts.commitMessage).slice(0, 200),
    head: branch,
    base,
    body: opts.prBody ?? "Opened from Cowork apply-with-warning flow.",
  });
  if (!pr?.html_url) throw new Error("PR creation returned no URL");
  return { branch, prUrl: pr.html_url as string, commitSha };
}
