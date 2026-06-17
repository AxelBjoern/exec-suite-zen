// Server-only: get a valid VDNX Supabase session for the test account.
// Caches the session in public.vdnx_session_cache so we don't sign in on
// every probe run. Refreshes via supabase.auth.refreshSession when within
// 5 minutes of expiry; falls back to signInWithPassword if refresh fails.
//
// VDNX is a SEPARATE Supabase project — we instantiate a fresh client
// pointed at VDNX_SUPABASE_URL / VDNX_SUPABASE_ANON_KEY. Those values are
// already used elsewhere in src/server/vdnx-probe.server.ts; if absent we
// fall back to the hardcoded vdnx.app values used in that file.

import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Hardcoded VDNX project (matches src/server/vdnx-probe.server.ts).
// Override via env if needed.
const VDNX_URL = process.env.VDNX_SUPABASE_URL ?? "https://nrgknrutiakjzczsmuwj.supabase.co";
const VDNX_ANON =
  process.env.VDNX_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZ2tucnV0aWFranpjenNtdXdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4OTM4MTksImV4cCI6MjA2MzQ2OTgxOX0.qB-mBDpgGjP-DqEHv1mUFVIWvWfDIYbXBNJDwxYPjJg";

const REFRESH_WINDOW_MS = 5 * 60 * 1000; // refresh if expiring within 5 min

export type VdnxSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  email: string;
  from_cache: boolean;
  refreshed: boolean;
};

function vdnxClient() {
  return createClient(VDNX_URL, VDNX_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

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
    // Try refresh first
    try {
      const sb = vdnxClient();
      const { data, error } = await sb.auth.refreshSession({ refresh_token: cached.refresh_token });
      if (!error && data.session) {
        const out = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at ?? Math.floor(now / 1000) + 3600,
          email,
        };
        await persist(out);
        return { ...out, from_cache: true, refreshed: true };
      }
    } catch {
      /* fall through to password sign-in */
    }
  }

  // Cold sign-in
  const sb = vdnxClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`VDNX sign-in failed for ${email}: ${error?.message ?? "no session returned"}`);
  }
  const out = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at ?? Math.floor(now / 1000) + 3600,
    email,
  };
  await persist(out);
  return { ...out, from_cache: false, refreshed: false };
}
