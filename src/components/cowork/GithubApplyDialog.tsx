import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GitPullRequest, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { applyToGithub, updateSession } from "@/lib/cowork.functions";

type GithubTarget = { repo: string; path: string; branch_prefix?: string };

export function GithubApplyDialog(props: {
  sessionId: string;
  defaultTitle: string;
  savedTarget: GithubTarget | null;
  onPushed?: (prUrl: string) => void;
}) {
  const applyFn = useServerFn(applyToGithub);
  const updateFn = useServerFn(updateSession);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [repo, setRepo] = useState(props.savedTarget?.repo ?? "");
  const [path, setPath] = useState(props.savedTarget?.path ?? "");
  const [commit, setCommit] = useState(`Cowork: ${props.defaultTitle}`.slice(0, 180));
  const [body, setBody] = useState("");
  const [saveTarget, setSaveTarget] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  async function submit() {
    if (!repo.trim() || !path.trim() || !commit.trim()) {
      toast.error("Repo, path, and commit message are required");
      return;
    }
    setBusy(true);
    try {
      if (saveTarget) {
        await updateFn({ data: { id: props.sessionId, github_target: { repo: repo.trim(), path: path.trim() } } });
      }
      const res = await applyFn({
        data: {
          id: props.sessionId,
          commit_message: commit.trim(),
          pr_body: body.trim() || undefined,
          target: { repo: repo.trim(), path: path.trim() },
        },
      });
      setPrUrl(res.prUrl);
      toast.success("Pull request opened");
      props.onPushed?.(res.prUrl);
    } catch (e: any) {
      toast.error(e?.message ?? "Push failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPrUrl(null); setConfirmed(false); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <GitPullRequest className="h-3 w-3 mr-1" /> Apply &amp; push to GitHub
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Push preview to GitHub</DialogTitle>
          <DialogDescription>Creates a new branch and opens a pull request — does not push to main.</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            This writes your current preview to a real repo as a PR. Double-check the repo and path —
            the VDNX repo is read-only and will be rejected.
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Repo (owner/repo)</Label>
            <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="acme/my-app" disabled={busy || !!prUrl} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">File path</Label>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="docs/cowork-output.md" disabled={busy || !!prUrl} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Commit message</Label>
            <Input value={commit} onChange={(e) => setCommit(e.target.value)} disabled={busy || !!prUrl} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">PR body (optional)</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} disabled={busy || !!prUrl} className="text-xs" />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={saveTarget} onChange={(e) => setSaveTarget(e.target.checked)} disabled={busy || !!prUrl} />
            Save this repo + path on the session
          </label>
          {!prUrl && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} />
              I understand this will open a PR against {repo || "the repo"} as my GitHub identity.
            </label>
          )}
          {prUrl && (
            <a href={prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              View pull request <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <DialogFooter>
          {prUrl ? (
            <Button size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">Done</Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy} className="h-8 text-xs">Cancel</Button>
              <Button size="sm" onClick={submit} disabled={busy || !confirmed} className="h-8 text-xs">
                {busy ? "Pushing…" : "Open pull request"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
