// Server-only helpers for storing per-user GitHub Personal Access Tokens.
// AES-256-GCM at rest using GITHUB_TOKEN_ENC_KEY.
// Read-only: we never expose write endpoints for these tokens.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyGithubToken, parseRepoTarget, findReadableRepoAlias } from "@/server/github.server";

function encKey(): Buffer {
  const raw = process.env.GITHUB_TOKEN_ENC_KEY;
  if (!raw) throw new Error("GITHUB_TOKEN_ENC_KEY missing");
  // Normalize any length to 32 bytes via SHA-256.
  return createHash("sha256").update(raw).digest();
}

function encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decrypt(row: { token_ciphertext: string; token_iv: string; token_tag: string }): string {
  const decipher = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(row.token_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.token_tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(row.token_ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export type UserGithubStatus = {
  connected: boolean;
  login: string | null;
  scopes: string[];
  hint: string | null;
  updatedAt: string | null;
};

export async function getUserGithubStatus(userId: string): Promise<UserGithubStatus> {
  const { data, error } = await supabaseAdmin
    .from("user_github_tokens")
    .select("login,scopes,token_hint,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { connected: false, login: null, scopes: [], hint: null, updatedAt: null };
  return {
    connected: true,
    login: data.login,
    scopes: (data.scopes ?? []) as string[],
    hint: data.token_hint,
    updatedAt: data.updated_at,
  };
}

export async function saveUserGithubTokenValue(userId: string, token: string): Promise<UserGithubStatus> {
  const clean = token.trim();
  if (!clean) throw new Error("Token is required");
  // Accept any non-empty token; verifyGithubToken below is the real gate.
  const info = await verifyGithubToken(clean);
  const { ciphertext, iv, tag } = encrypt(clean);
  const hint = clean.slice(-4);
  const { error } = await supabaseAdmin.from("user_github_tokens").upsert({
    user_id: userId,
    token_ciphertext: ciphertext,
    token_iv: iv,
    token_tag: tag,
    token_hint: hint,
    login: info.login,
    scopes: info.scopes,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { connected: true, login: info.login, scopes: info.scopes, hint, updatedAt: new Date().toISOString() };
}

export async function deleteUserGithubToken(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("user_github_tokens").delete().eq("user_id", userId);
  if (error) throw error;
}

/** Returns the decrypted PAT for a user, or null if none saved / decryption fails. */
export async function getUserGithubToken(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("user_github_tokens")
      .select("token_ciphertext,token_iv,token_tag")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return decrypt(data);
  } catch (e) {
    console.error("[user-github] decrypt failed", e);
    return null;
  }
}

export type RepoAccessTest = {
  ok: boolean;
  repo: string;
  resolvedFrom: string | null;
  private: boolean | null;
  defaultBranch: string | null;
  fileCount: number | null;
  error: string | null;
};

export async function testUserRepoAccess(userId: string, repoUrl: string): Promise<RepoAccessTest> {
  const token = await getUserGithubToken(userId);
  if (!token) {
    return { ok: false, repo: repoUrl, resolvedFrom: null, private: null, defaultBranch: null, fileCount: null, error: "No GitHub token saved yet." };
  }
  let slug = repoUrl;
  try {
    slug = parseRepoTarget(repoUrl).repo;
  } catch (e: any) {
    return { ok: false, repo: repoUrl, resolvedFrom: null, private: null, defaultBranch: null, fileCount: null, error: e?.message ?? "Invalid repo URL" };
  }
  const requestedSlug = slug;

  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "VDNX-Agent-Bridge",
    Authorization: `Bearer ${token}`,
  };

  try {
    let repoRes = await fetch(`https://api.github.com/repos/${slug}`, { headers: h });
    if (repoRes.status === 404) {
      const alias = await findReadableRepoAlias(slug, token);
      if (alias && alias.toLowerCase() !== slug.toLowerCase()) {
        slug = alias;
        repoRes = await fetch(`https://api.github.com/repos/${slug}`, { headers: h });
      }
    }
    if (!repoRes.ok) {
      const body = await repoRes.text().catch(() => "");
      const hint =
        repoRes.status === 404
          ? `Token can't see ${slug}. If fine-grained, grant this exact repo access with Contents: Read-only. If classic PAT, needs 'repo' scope.`
          : repoRes.status === 401
          ? "Token rejected (401). Regenerate the PAT and try again."
          : repoRes.status === 403
          ? "Token forbidden (403). Check SSO authorization or scopes."
          : `GitHub ${repoRes.status}: ${body.slice(0, 160)}`;
      return { ok: false, repo: slug, resolvedFrom: slug !== requestedSlug ? requestedSlug : null, private: null, defaultBranch: null, fileCount: null, error: hint };
    }
    const repoJson: any = await repoRes.json();

    const contentsRes = await fetch(`https://api.github.com/repos/${slug}/contents/`, { headers: h });
    let fileCount: number | null = null;
    if (contentsRes.ok) {
      const arr = await contentsRes.json().catch(() => null);
      if (Array.isArray(arr)) fileCount = arr.length;
    }

    return {
      ok: true,
      repo: slug,
      resolvedFrom: slug !== requestedSlug ? requestedSlug : null,
      private: !!repoJson?.private,
      defaultBranch: repoJson?.default_branch ?? null,
      fileCount,
      error: null,
    };
  } catch (e: any) {
    return { ok: false, repo: slug, resolvedFrom: slug !== requestedSlug ? requestedSlug : null, private: null, defaultBranch: null, fileCount: null, error: e?.message ?? "Network error" };
  }
}
