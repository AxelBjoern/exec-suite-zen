import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyGithubStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getUserGithubStatus } = await import("@/server/user-github.server");
    return getUserGithubStatus(context.userId);
  });

export const saveMyGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => {
    if (!data || typeof data.token !== "string") throw new Error("token is required");
    return { token: data.token };
  })
  .handler(async ({ context, data }) => {
    const { saveUserGithubTokenValue } = await import("@/server/user-github.server");
    return saveUserGithubTokenValue(context.userId, data.token);
  });

export const deleteMyGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteUserGithubToken } = await import("@/server/user-github.server");
    await deleteUserGithubToken(context.userId);
    return { ok: true };
  });
