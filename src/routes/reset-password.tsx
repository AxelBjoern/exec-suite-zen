import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Reset password — VDNX" }],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Give detectSessionInUrl a tick to process the recovery hash.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!data.session);
      setChecking(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(!!session);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    navigate({ to: "/", replace: true });
  }

  async function onResend(e: FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error("Enter your email.");
      return;
    }
    setResendBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResendBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Reset email sent. Open the link in this browser.");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="top-right" />
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <div className="rounded-lg border border-border bg-panel p-6">
          <h1 className="font-serif text-2xl font-bold text-foreground">Reset password</h1>

          {checking ? (
            <p className="mt-4 text-sm text-muted-foreground">Verifying reset link…</p>
          ) : hasSession ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter a new password for your account.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Updating…" : "Update password"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Your reset link is missing or expired. Request a new one and open the email
                link in this same browser.
              </p>
              <form onSubmit={onResend} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button type="submit" disabled={resendBusy} className="w-full">
                  {resendBusy ? "Sending…" : "Send reset email"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
