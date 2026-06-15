import { useEffect, useRef, useState } from "react";
import MarkdownPreview from "@uiw/react-markdown-preview";
import mermaid from "mermaid";
import { diffLines } from "diff";
import { Loader2, GitCompare, Check, RotateCcw, Edit3, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PreviewType = "markdown" | "tsx" | "ts" | "json" | "mermaid" | "text";

type Props = {
  content: string;
  type: PreviewType;
  originalContent?: string;
  onApply?: () => void;
  onRegenerate?: () => void;
  onChange?: (next: string) => void;
  applying?: boolean;
  regenerating?: boolean;
};

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });

export function PreviewPane({
  content, type, originalContent, onApply, onRegenerate, onChange, applying, regenerating,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const canDiff = !!(originalContent && originalContent !== content);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-panel px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Preview · {type}</span>
        <div className="flex items-center gap-1.5">
          {(type === "tsx" || type === "ts" || type === "json" || type === "markdown") && onChange && (
            <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)} className="h-7 text-xs">
              {editing ? <Eye className="mr-1 h-3 w-3" /> : <Edit3 className="mr-1 h-3 w-3" />}
              {editing ? "Preview" : "Edit"}
            </Button>
          )}
          {onRegenerate && (
            <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={regenerating} className="h-7 text-xs">
              {regenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
              Regenerate
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDiffOpen(true)} disabled={!canDiff} className="h-7 text-xs">
            <GitCompare className="mr-1 h-3 w-3" /> Diff
          </Button>
          {onApply && (
            <Button size="sm" onClick={onApply} disabled={applying || !content.trim()} title="Save this preview as the accepted snapshot for this session" className="h-7 text-xs">
              {applying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
              Save
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-background">
        {!content.trim() ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
            Ask Vibe Coder to draft a brief, a workflow JSON, a Mermaid diagram, or some code — it'll render here.
          </div>
        ) : editing ? (
          <Textarea
            value={content}
            onChange={(e) => onChange?.(e.target.value)}
            className="h-full min-h-full resize-none border-0 rounded-none font-mono text-xs"
          />
        ) : type === "markdown" ? (
          <div className="p-4">
            <MarkdownPreview source={content} style={{ background: "transparent", color: "inherit" }} />
          </div>
        ) : type === "mermaid" ? (
          <MermaidBlock chart={content} />
        ) : (
          <pre className="m-0 overflow-auto bg-panel-2 p-4 text-xs text-foreground"><code>{content}</code></pre>
        )}
      </div>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Changes since last apply</DialogTitle></DialogHeader>
          <DiffView original={originalContent ?? ""} updated={content} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const idRef = useRef(`mmd-${Math.random().toString(36).slice(2, 10)}`);
  useEffect(() => {
    let cancelled = false;
    setErr(null);
    mermaid.render(idRef.current, chart).then(({ svg }) => {
      if (!cancelled) setSvg(svg);
    }).catch((e) => { if (!cancelled) setErr(e?.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [chart]);
  if (err) return <pre className="m-0 p-4 text-xs text-destructive whitespace-pre-wrap">{err}</pre>;
  if (!svg) return <div className="flex items-center justify-center p-6 text-xs text-muted-foreground"><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Rendering…</div>;
  return <div className="p-4 [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function DiffView({ original, updated }: { original: string; updated: string }) {
  const parts = diffLines(original, updated);
  return (
    <div className="max-h-[60vh] overflow-auto rounded-md border border-border bg-panel-2 font-mono text-xs">
      {parts.map((p, i) => (
        <div
          key={i}
          className={
            p.added ? "bg-primary/15 text-foreground" :
            p.removed ? "bg-destructive/15 text-foreground line-through" :
            "text-muted-foreground"
          }
        >
          {p.value.split("\n").filter((_, idx, arr) => idx < arr.length - 1 || arr[idx] !== "").map((line, j) => (
            <div key={j} className="px-3 py-0.5 whitespace-pre-wrap">
              <span className="select-none pr-2 opacity-50">{p.added ? "+" : p.removed ? "−" : " "}</span>
              {line || "\u00A0"}
            </div>
          ))}
        </div>
      ))}
      {parts.length === 0 && <div className="p-3 text-muted-foreground">No differences.</div>}
    </div>
  );
}
