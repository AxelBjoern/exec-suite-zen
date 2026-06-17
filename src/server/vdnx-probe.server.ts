// Server-only helper for signing into a VDNX sandbox tenant as an agent.
//
// Previously this called VDNX's signature-gated `agent-signin` edge function
// and exchanged the returned token_hash for a session via verifyOtp. That
// path requires a valid legacy `apikey` header, which VDNX has disabled.
//
// New behavior: delegate to getVdnxSession (browser-driven sign-in through
// the live web UI), then wrap the resulting tokens into a supabase-js client
// with the bearer token attached.
//
// SANDBOX ONLY. Never call from client code. Never log the JWT.

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { getVdnxSession } from "@/server/vdnx-session.server";

// VDNX is a separate Supabase project from this one. URL + anon are public.
// The anon key is kept around because supabase-js requires *some* apikey
// string at construction; for our use the Bearer token in Authorization is
// what actually carries the user identity for RLS.
export const VDNX_SUPABASE_URL = "https://qumqodukmflucvivblqx.supabase.co";
export const VDNX_SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1bXFvZHVrbWZsdWN2aXZibHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5Nzg0OTYsImV4cCI6MjA2MTU1NDQ5Nn0.-qusc7ibJfkwKIdefcEsBWQ7gpE3z6vllUlUlqMCKvQ";
export const VDNX_STORAGE_KEY = "sb-qumqodukmflucvivblqx-auth-token";

export interface AgentSession {
  supabase: SupabaseClient;
  session: Session;
}

export async function signInAsAgent(
  targetEmail: string,
  agentId: string,
): Promise<AgentSession> {
  if (!targetEmail || !agentId) throw new Error("targetEmail and agentId required");

  const s = await getVdnxSession({ email: targetEmail });

  const supabase = createClient(VDNX_SUPABASE_URL, VDNX_SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${s.access_token}` } },
  });

  // Build a minimal Session shape for callers that need it (e.g. the
  // Playwright probe runner that seeds localStorage).
  const session: Session = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    expires_in: Math.max(0, s.expires_at - Math.floor(Date.now() / 1000)),
    token_type: "bearer",
    user: { id: "", aud: "", email: s.email } as Session["user"],
  };

  return { supabase, session };
}
