import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ModuleSwitcher } from "@/components/ModuleSwitcher";
import { VdnxLoader } from "@/components/VdnxLoader";

/** Never let a hanging auth network call blank the whole app. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession reads the locally persisted session first (no network round-trip).
    const local = await withTimeout(supabase.auth.getSession(), 4000);
    const session = local?.data.session ?? null;
    if (session?.user) return { user: session.user };

    const remote = await withTimeout(supabase.auth.getUser(), 6000);
    if (!remote || remote.error || !remote.data.user) throw redirect({ to: "/auth" });
    return { user: remote.data.user };
  },
  pendingComponent: () => (
    <div className="min-h-screen grid place-items-center bg-background">
      <VdnxLoader />
    </div>
  ),
  component: AuthedLayout,
});


function AuthedLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ModuleSwitcher />
      <Outlet />
    </div>
  );
}
