import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Download, Link2, Check, FileText } from "lucide-react";
import { toast } from "sonner";

export type DocArtifact = {
  kind: "pdf" | "docx";
  title: string;
  subtitle?: string | null;
  filename: string;
  url: string;
  sizeKB?: number;
  createdAt?: string;
};

export function ArtifactDrawer({
  artifact,
  open,
  onOpenChange,
}: {
  artifact: DocArtifact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  const isPdf = artifact?.kind === "pdf";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[680px] p-0 flex flex-col gap-0 bg-card"
      >
        {artifact && (
          <>
            <header className="border-b border-border px-5 py-4 flex items-start gap-3">
              <div className="h-9 w-9 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-sm truncate">
                    {artifact.title}
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-wider border border-border px-1.5 py-0.5 text-muted-foreground shrink-0">
                    {artifact.kind}
                  </span>
                </div>
                {artifact.subtitle && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {artifact.subtitle}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                  {artifact.filename}
                  {artifact.sizeKB ? ` · ${artifact.sizeKB} KB` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 pr-7">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyLink}
                  className="h-8 px-2"
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 gap-1.5"
                >
                  <a href={artifact.url} download={artifact.filename}>
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </Button>
              </div>
            </header>

            <div className="flex-1 min-h-0 bg-muted/30">
              {isPdf ? (
                <iframe
                  key={artifact.url}
                  src={artifact.url}
                  title={artifact.title}
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-8">
                  <div className="max-w-sm w-full text-center space-y-4 rounded-xl border border-border bg-background p-8">
                    <div className="mx-auto h-14 w-14 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{artifact.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                        {artifact.filename}
                        {artifact.sizeKB ? ` · ${artifact.sizeKB} KB` : ""}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Word documents can't be previewed inline. Download to open in your editor of choice.
                    </p>
                    <Button asChild size="sm" className="gap-1.5">
                      <a href={artifact.url} download={artifact.filename}>
                        <Download className="h-3.5 w-3.5" />
                        Download {artifact.kind.toUpperCase()}
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

const ARTIFACT_LINK_RE =
  /\[Download\s+(PDF|DOCX)\s+—\s+([^\](]+?)\s*\(([\d.]+)\s*KB\)\]\(([^)]+)\)/i;
const TITLE_RE = /📄\s+\*\*([^*]+)\*\*/;

export function parseArtifactFromMarkdown(md: string): DocArtifact | null {
  const link = md.match(ARTIFACT_LINK_RE);
  if (!link) return null;
  const titleMatch = md.match(TITLE_RE);
  const kind = link[1].toLowerCase() === "docx" ? "docx" : "pdf";
  return {
    kind,
    title: titleMatch?.[1]?.trim() ?? link[2].trim(),
    filename: link[2].trim(),
    sizeKB: Number(link[3]) || undefined,
    url: link[4].trim(),
  };
}

export function ArtifactPill({
  artifact,
  onOpen,
}: {
  artifact: DocArtifact;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group mt-2 inline-flex items-center gap-3 rounded-lg border border-border bg-background hover:bg-muted/60 hover:border-primary/40 transition-colors px-3 py-2 text-left max-w-full"
    >
      <div className="h-9 w-9 shrink-0 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{artifact.title}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-1.5 py-0.5 shrink-0">
            {artifact.kind}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground font-mono truncate">
          {artifact.sizeKB ? `${artifact.sizeKB} KB · ` : ""}Click to open
        </div>
      </div>
    </button>
  );
}
