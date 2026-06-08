import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isVdnxOwnerEmail } from "@/lib/vdnx";
import { LogOut, LayoutGrid, MessageSquare, TerminalSquare, LineChart, Cpu, Send } from "lucide-react";

const MODS = [
  { to: "/", label: "Hub", icon: LayoutGrid, ownerOnly: false },
  { to: "/chat", label: "Chat", icon: MessageSquare, ownerOnly: false },
  { to: "/terminal", label: "Terminal", icon: TerminalSquare, ownerOnly: true },
  { to: "/budget", label: "Budget", icon: LineChart, ownerOnly: false },
  { to: "/agents-models", label: "Agents & Models", icon: Cpu, ownerOnly: false },
  { to: "/outbound", label: "Outbound", icon: Send, ownerOnly: false },
] as const;

export function ModuleSwitcher() {
  const router = useRouter();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isOwner = isVdnxOwnerEmail(email);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-3 py-2 md:px-5">
        <Link to="/" className="mr-2 font-serif text-base font-bold text-primary">
          VDNX
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {MODS.filter((m) => !m.ownerOnly || isOwner).map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to as any}
                className={
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition " +
                  (active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          aria-label="Sign out"
          className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:border-destructive/40 hover:text-destructive sm:px-3"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
