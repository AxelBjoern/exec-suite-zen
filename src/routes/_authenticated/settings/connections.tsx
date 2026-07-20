import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Linkedin, CheckCircle2, XCircle, Github, ExternalLink, MessageSquare, Trash2 } from "lucide-react";
import { getConnectorStatus } from "@/lib/connections.functions";
import { getMyGithubStatus, saveMyGithubToken, deleteMyGithubToken, testMyRepoAccess } from "@/lib/user-github.functions";
import {
  listChannelBindings,
  createTelegramLinkCode,
  setChannelAutoReply,
  deleteChannelBinding,
} from "@/serverfns/channel-inbox.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/settings/connections")({
  head: () => ({
    meta: [
      { title: "VDNX — Connections" },
      { name: "description", content: "Workspace connectors (Gmail, LinkedIn) and personal GitHub token for private-repo reads in chat." },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const statusFn = useServerFn(getConnectorStatus);
  const { data, isLoading } = useQuery({ queryKey: ["connector-status"], queryFn: () => statusFn() });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Settings · Connections</p>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Workspace connectors</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Gmail and LinkedIn are connected once at the workspace level. GitHub is per-user — attach your own Personal Access Token to let the chat read your private repos.
      </p>

      <div className="mt-8 grid gap-4">
        <Card icon={Mail} label="Gmail" connected={data?.gmail ?? false} loading={isLoading} description="Used to send outbound and reminder emails." />
        <Card icon={Linkedin} label="LinkedIn" connected={data?.linkedin ?? false} loading={isLoading} description="Used to publish LinkedIn posts (with optional image)." />
        <GithubCard />
        <ChannelInboxCard />
      </div>

      <section className="mt-8 rounded-lg border border-border bg-panel p-5 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">How to connect or change Gmail / LinkedIn</p>
        <p className="mt-2">
          Open the <strong>Connectors</strong> panel in Lovable (sidebar → Connectors), then connect or reconnect <em>Gmail</em> and <em>LinkedIn</em>. The connection becomes available to this app immediately.
        </p>
      </section>
    </main>
  );
}

function Card({
  icon: Icon, label, connected, loading, description,
}: { icon: typeof Mail; label: string; connected: boolean; loading: boolean; description: string }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">{label}</h2>
        </div>
        {loading ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Checking…</span>
        ) : connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-500">
            <XCircle className="h-3 w-3" />Not connected
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      {!loading && !connected && (
        <p className="mt-3 text-xs italic text-amber-500">Connect {label} in the Lovable Connectors panel to enable sending.</p>
      )}
    </section>
  );
}

type RepoTest = {
  ok: boolean;
  repo: string;
  resolvedFrom: string | null;
  private: boolean | null;
  defaultBranch: string | null;
  fileCount: number | null;
  error: string | null;
};

function GithubCard() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getMyGithubStatus);
  const saveFn = useServerFn(saveMyGithubToken);
  const deleteFn = useServerFn(deleteMyGithubToken);
  const testFn = useServerFn(testMyRepoAccess);
  const { data, isLoading } = useQuery({ queryKey: ["my-github"], queryFn: () => statusFn() });
  const [token, setToken] = useState("");
  const [testRepo, setTestRepo] = useState("");
  const [testResult, setTestResult] = useState<RepoTest | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vdnx.gh.testRepo");
      if (saved) setTestRepo(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("vdnx.gh.testRepo", testRepo);
    } catch {}
  }, [testRepo]);

  const save = useMutation({
    mutationFn: (args: { token: string; testRepoUrl: string }) =>
      saveFn({ data: { token: args.token, testRepoUrl: args.testRepoUrl } }),
    onSuccess: (res) => {
      toast.success("GitHub token saved");
      setToken("");
      setTestResult((res as any)?.test ?? null);
      qc.invalidateQueries({ queryKey: ["my-github"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save token"),
  });

  const test = useMutation({
    mutationFn: (url: string) => testFn({ data: { repoUrl: url } }),
    onSuccess: (res) => setTestResult(res as RepoTest),
    onError: (e: any) => toast.error(e?.message ?? "Test failed"),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn(),
    onSuccess: () => {
      toast.success("GitHub token removed");
      setTestResult(null);
      qc.invalidateQueries({ queryKey: ["my-github"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove token"),
  });

  const connected = !!data?.connected;

  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">GitHub (personal)</h2>
        </div>
        {isLoading ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Checking…</span>
        ) : connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-500">
            <XCircle className="h-3 w-3" />Not connected
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Attach a GitHub Personal Access Token so the chat can read your private repos. Read-only — VDNX never writes, commits, or pushes.
      </p>

      {connected && (
        <div className="mt-3 rounded-md border border-border bg-background/50 p-3 text-xs">
          <div><span className="text-muted-foreground">Account:</span> <span className="font-mono">{data?.login ?? "—"}</span></div>
          <div className="mt-1"><span className="text-muted-foreground">Token:</span> <span className="font-mono">…{data?.hint}</span></div>
          <div className="mt-1"><span className="text-muted-foreground">Scopes:</span> <span className="font-mono">{(data?.scopes ?? []).join(", ") || "(fine-grained)"}</span></div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <Input
          type="password"
          placeholder="ghp_… or github_pat_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="h-8 text-xs font-mono"
          autoComplete="off"
        />
        <Input
          type="text"
          placeholder="Test repo URL — https://github.com/owner/repo (optional but recommended)"
          value={testRepo}
          onChange={(e) => setTestRepo(e.target.value)}
          className="h-8 text-xs font-mono"
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!token.trim() || save.isPending}
            onClick={() => save.mutate({ token: token.trim(), testRepoUrl: testRepo.trim() })}
          >
            {save.isPending ? "Saving & testing…" : connected ? "Replace token & test" : "Save token & test"}
          </Button>
          {connected && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!testRepo.trim() || test.isPending}
              onClick={() => test.mutate(testRepo.trim())}
            >
              {test.isPending ? "Testing…" : "Test again"}
            </Button>
          )}
          {connected && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Removing…" : "Disconnect"}
            </Button>
          )}
        </div>
      </div>

      {testResult && (
        <div
          className={`mt-3 rounded-md border p-3 text-xs ${
            testResult.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {testResult.ok ? (
            <>
              <div className="flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3 w-3" /> Read access confirmed
              </div>
              <div className="mt-1 font-mono text-[11px] opacity-90">
                {testResult.repo} · {testResult.private ? "private" : "public"} · default branch{" "}
                <strong>{testResult.defaultBranch ?? "?"}</strong>
                {testResult.fileCount != null ? ` · ${testResult.fileCount} entries at root` : ""}
              </div>
              {testResult.resolvedFrom && (
                <div className="mt-1 font-mono text-[11px] opacity-80">
                  matched from requested repo {testResult.resolvedFrom}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 font-semibold">
                <XCircle className="h-3 w-3" /> Read access failed
              </div>
              <div className="mt-1 font-mono text-[11px] opacity-90">
                {testResult.repo}: {testResult.error}
              </div>
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Create a token at{" "}
        <a
          href="https://github.com/settings/tokens?type=beta"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          github.com/settings/tokens <ExternalLink className="h-3 w-3" />
        </a>
        . Fine-grained recommended: select the private repos you want VDNX to read, grant <strong>Contents: Read-only</strong>. Classic PATs need the <code>repo</code> scope.
      </p>
    </section>
  );
}

function ChannelInboxCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listChannelBindings);
  const createFn = useServerFn(createTelegramLinkCode);
  const autoFn = useServerFn(setChannelAutoReply);
  const delFn = useServerFn(deleteChannelBinding);

  const { data: bindings, isLoading } = useQuery({
    queryKey: ["channel-bindings"],
    queryFn: () => listFn(),
  });

  const create = useMutation({
    mutationFn: () => createFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel-bindings"] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed to mint code"),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; auto_reply: boolean }) => autoFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel-bindings"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel-bindings"] }),
  });

  const pending = (bindings ?? []).filter((b: any) => !b.verified_at && b.link_code);
  const active = (bindings ?? []).filter((b: any) => b.verified_at);

  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">Channel Inbox — Telegram</h2>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Minting…" : "New link code"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Incoming Telegram messages become inbound leads. The triage agent drafts a reply; approved drafts send back through the same chat.
      </p>

      {isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <div className="font-semibold text-amber-700 dark:text-amber-400">Waiting for handshake</div>
              {pending.map((b: any) => (
                <div key={b.id} className="mt-1 font-mono">
                  Send <code className="rounded bg-background px-1">/link {b.link_code}</code> to your VDNX Telegram bot
                  {b.link_expires_at && <> — expires {new Date(b.link_expires_at).toLocaleTimeString()}</>}
                </div>
              ))}
            </div>
          )}

          {active.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No linked chats yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border">
              {active.map((b: any) => (
                <li key={b.id} className="flex items-center justify-between gap-2 p-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono">chat {b.external_chat_id}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      linked {new Date(b.verified_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-3 w-3 accent-primary"
                        checked={!!b.auto_reply}
                        onChange={(e) => toggle.mutate({ id: b.id, auto_reply: e.target.checked })}
                      />
                      auto-reply
                    </label>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => remove.mutate(b.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
