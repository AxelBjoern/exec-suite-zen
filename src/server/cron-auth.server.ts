// Shared apikey check for /api/public/cron/* endpoints.
// Prefers VDNX_CRON_SECRET when set (dedicated cron secret), falls back to
// SUPABASE_PUBLISHABLE_KEY for backward compatibility during the secret
// rollout. pg_cron passes the chosen value as the `apikey` header.

export function checkCronAuth(request: Request): Response | null {
  const cronSecret = process.env.VDNX_CRON_SECRET;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  const accepted = [cronSecret, anon].filter(Boolean) as string[];
  if (accepted.length === 0) return new Response("missing VDNX_CRON_SECRET", { status: 500 });
  const got =
    request.headers.get("apikey") ??
    request.headers.get("x-cron-secret") ??
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!got || !accepted.includes(got)) return new Response("unauthorized", { status: 401 });
  return null;
}
