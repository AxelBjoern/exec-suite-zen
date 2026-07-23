import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyGithubStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getUserGithubStatus } = await import("@/lib/user-github.server");
    return getUserGithubStatus(context.userId);
  });

export const saveMyGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string; testRepoUrl?: string }) => {
    if (!data || typeof data.token !== "string") throw new Error("token is required");
    return { token: data.token, testRepoUrl: typeof data.testRepoUrl === "string" ? data.testRepoUrl : "" };
  })
  .handler(async ({ context, data }) => {
    const { saveUserGithubTokenValue, testUserRepoAccess } = await import("@/lib/user-github.server");
    const status = await saveUserGithubTokenValue(context.userId, data.token);
    const test = data.testRepoUrl.trim()
      ? await testUserRepoAccess(context.userId, data.testRepoUrl.trim())
      : null;
    return { status, test };
  });

export const testMyRepoAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { repoUrl: string }) => {
    if (!data || typeof data.repoUrl !== "string" || !data.repoUrl.trim()) throw new Error("repoUrl is required");
    return { repoUrl: data.repoUrl.trim() };
  })
  .handler(async ({ context, data }) => {
    const { testUserRepoAccess } = await import("@/lib/user-github.server");
    return testUserRepoAccess(context.userId, data.repoUrl);
  });

export const deleteMyGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteUserGithubToken } = await import("@/lib/user-github.server");
    await deleteUserGithubToken(context.userId);
    return { ok: true };
  });
