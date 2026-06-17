// Server-only: get a valid VDNX Supabase session for the test account.
// Caches the session in public.vdnx_session_cache so we don't sign in on
// every probe run. When the cached session is within the refresh window
// (or absent), we drive a real browser through the live VDNX web UI to
// produce a fresh session — this side-steps VDNX's disabled legacy API
// keys, which would otherwise reject REST sign-in/refresh.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { signInVdnxViaBrowser } from "@/server/vdnx-browser-signin.server";

const REFRESH_WINDOW_MS = 5 * 60 * 1000; // refresh if expiring within 5 min

export type VdnxSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  email: string;
  from_cache: boolean;
  refreshed: boolean;
};

async function loadCached(email: string) {
  const { data, error } = await supabaseAdmin
    .from("vdnx_session_cache")
    .select("access_token, refresh_token, expires_at")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`vdnx_session_cache read failed: ${error.message}`);
  return data;
}

async function persist(session: { access_token: string; refresh_token: string; expires_at: number; email: string }) {
  const { error } = await supabaseAdmin.from("vdnx_session_cache").upsert({
    email: session.email,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: new Date(session.expires_at * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`vdnx_session_cache write failed: ${error.message}`);
}

export async function getVdnxSession(opts: { email: string; password?: string }): Promise<VdnxSession> {
  const email = opts.email;
  const password = opts.password ?? process.env.VDNX_TEST_PASSWORD;
  if (!password) throw new Error("VDNX_TEST_PASSWORD not set");

  const cached = await loadCached(email);
  const now = Date.now();

  if (cached) {
    const expiresMs = new Date(cached.expires_at).getTime();
    if (expiresMs - now > REFRESH_WINDOW_MS) {
      return {
        access_token: cached.access_token,
        refresh_token: cached.refresh_token,
        expires_at: Math.floor(expiresMs / 1000),
        email,
        from_cache: true,
        refreshed: false,
      };
    }
  }

  // Cold sign-in (or near-expiry refresh) — drive the live web UI. REST
  // refresh requires a valid `apikey` header, which VDNX no longer accepts
  // for the legacy anon key, so re-signing through the browser is simpler
  // and strictly more reliable than juggling key formats.
  const fresh = await signInVdnxViaBrowser({ email, password });
  await persist(fresh);
  return { ...fresh, from_cache: false, refreshed: Boolean(cached) };
}
