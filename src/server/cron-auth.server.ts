// Shared apikey check for /api/public/cron/* endpoints.
// We compare against SUPABASE_PUBLISHABLE_KEY (anon). pg_cron passes it as `apikey`.

export function checkCronAuth(request: Request): Response | null {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!expected) return new Response("missing SUPABASE_PUBLISHABLE_KEY", { status: 500 });
  const got = request.headers.get("apikey") ?? request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (got !== expected) return new Response("unauthorized", { status: 401 });
  return null;
}
