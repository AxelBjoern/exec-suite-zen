import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownPreview from "@uiw/react-markdown-preview";
import mermaid from "mermaid";
import { diffLines } from "diff";
import { Loader2, GitCompare, Check, RotateCcw, Edit3, Eye, Play, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PreviewType = "markdown" | "tsx" | "ts" | "json" | "mermaid" | "text" | "html" | "image";

type Props = {
  content: string;
  type: PreviewType;
  originalContent?: string;
  iterationOriginal?: string;
  onApply?: () => void;
  onRegenerate?: () => void;
  onChange?: (next: string) => void;
  applying?: boolean;
  regenerating?: boolean;
};

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });

export function PreviewPane({
  content, type, originalContent, iterationOriginal,
  onApply, onRegenerate, onChange, applying, regenerating,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [runTsx, setRunTsx] = useState(true);
  const [copied, setCopied] = useState(false);
  const canDiff = !!((originalContent && originalContent !== content) || (iterationOriginal && iterationOriginal !== content));
  const looksLikeHtml = /^\s*(<!doctype\s+html|<html[\s>])/i.test(content);
  const effectiveType: PreviewType = (type === "markdown" || type === "text") && looksLikeHtml ? "html" : type;
  const isCodeLike = effectiveType === "tsx" || effectiveType === "ts" || effectiveType === "json" || effectiveType === "markdown" || effectiveType === "html";
  const canRun = effectiveType === "tsx" || effectiveType === "ts";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-panel px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground shrink-0">Preview · {type}</span>
        <div className="flex items-center gap-1">
          {canRun && !editing && (
            <Button size="sm" variant={runTsx ? "secondary" : "ghost"} onClick={() => setRunTsx((r) => !r)} className="h-7 text-xs">
              {runTsx ? <Eye className="mr-1 h-3 w-3" /> : <Play className="mr-1 h-3 w-3" />}
              {runTsx ? "Source" : "Run"}
            </Button>
          )}
          {isCodeLike && onChange && (
            <Button size="sm" variant={editing ? "secondary" : "ghost"} onClick={() => setEditing((e) => !e)} className="h-7 text-xs">
              {editing ? <><Eye className="mr-1 h-3 w-3" />Preview</> : <><Edit3 className="mr-1 h-3 w-3" />Edit</>}
            </Button>
          )}
          {onRegenerate && (
            <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={regenerating} className="h-7 text-xs">
              {regenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
              Regenerate
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!content.trim()} className="h-7 text-xs" title="Copy preview content">
            {copied ? <><Check className="mr-1 h-3 w-3" />Copied</> : <><Copy className="mr-1 h-3 w-3" />Copy</>}
          </Button>
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
            Ask Vibe Coder to draft a brief, a workflow JSON, a Mermaid diagram, HTML, a React component, or some code — it'll render here.
          </div>
        ) : editing ? (
          <Textarea
            value={content}
            onChange={(e) => onChange?.(e.target.value)}
            className="h-full min-h-full resize-none border-0 rounded-none font-mono text-xs"
          />
        ) : effectiveType === "markdown" ? (
          <div className="p-4">
            <MarkdownPreview source={content} style={{ background: "transparent", color: "inherit" }} />
          </div>
        ) : effectiveType === "mermaid" ? (
          <MermaidBlock chart={content} />
        ) : effectiveType === "html" ? (
          <HtmlPreview html={content} />
        ) : effectiveType === "image" ? (
          <ImagePreview src={content} />
        ) : canRun && runTsx ? (
          <TsxRunner code={content} />
        ) : (
          <pre className="m-0 overflow-auto bg-panel-2 p-4 text-xs text-foreground"><code>{content}</code></pre>
        )}
      </div>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Changes</DialogTitle></DialogHeader>
          <Tabs defaultValue={iterationOriginal && iterationOriginal !== content ? "iter" : "apply"}>
            <TabsList>
              <TabsTrigger value="apply" disabled={!(originalContent && originalContent !== content)}>Since last save</TabsTrigger>
              <TabsTrigger value="iter" disabled={!(iterationOriginal && iterationOriginal !== content)}>Since previous iteration</TabsTrigger>
            </TabsList>
            <TabsContent value="apply"><DiffView original={originalContent ?? ""} updated={content} /></TabsContent>
            <TabsContent value="iter"><DiffView original={iterationOriginal ?? ""} updated={content} /></TabsContent>
          </Tabs>
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

function HtmlPreview({ html }: { html: string }) {
  const doc = useMemo(() => {
    if (/<html[\s>]/i.test(html)) return html;
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:1rem;color:#111;background:#fff}</style></head><body>${html}</body></html>`;
  }, [html]);
  return (
    <iframe
      title="HTML preview"
      sandbox="allow-scripts"
      srcDoc={doc}
      className="h-full w-full border-0 bg-white"
    />
  );
}

function ImagePreview({ src }: { src: string }) {
  const ok = /^(https:\/\/|data:image\/)/i.test(src.trim());
  if (!ok) return <pre className="m-0 p-4 text-xs text-destructive whitespace-pre-wrap">Image URL must use https:// or data:image/…</pre>;
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <img src={src.trim()} alt="Preview" className="max-h-full max-w-full object-contain rounded-md border border-border" />
    </div>
  );
}

function TsxRunner({ code }: { code: string }) {
  const doc = useMemo(() => buildTsxRunnerDoc(code), [code]);
  return (
    <iframe
      title="React preview"
      sandbox="allow-scripts"
      srcDoc={doc}
      className="h-full w-full border-0 bg-white"
    />
  );
}

function buildTsxRunnerDoc(code: string): string {
  const escaped = code.replace(/<\/script>/gi, "<\\/script>");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui,sans-serif;margin:0;padding:1rem;color:#111;background:#fff}
    #__err{position:fixed;left:0;right:0;bottom:0;max-height:50%;overflow:auto;background:#fee;color:#900;font-family:ui-monospace,monospace;font-size:12px;padding:8px;border-top:1px solid #f00;white-space:pre-wrap;display:none}
  </style></head><body>
  <div id="root"></div>
  <div id="__err"></div>
  <script type="module">
    const showErr = (msg) => { const el = document.getElementById('__err'); el.textContent = String(msg); el.style.display='block'; };
    window.addEventListener('error', (e) => showErr(e.error?.stack || e.message));
    window.addEventListener('unhandledrejection', (e) => showErr(e.reason?.stack || e.reason));
    try {
      const React = await import('https://esm.sh/react@18');
      const ReactDOM = await import('https://esm.sh/react-dom@18/client');
      const Babel = (await import('https://esm.sh/@babel/standalone@7.25.6')).default || (await import('https://esm.sh/@babel/standalone@7.25.6'));
      const src = ${JSON.stringify(escaped)};
      const out = Babel.transform(src, { presets: [['react', { runtime: 'classic' }], 'typescript'], plugins: ['transform-modules-commonjs'], filename: 'snippet.tsx' }).code;
      const require = (id) => {
        if (id === 'react') return React;
        if (id === 'react-dom') return ReactDOM;
        if (id === 'react-dom/client') return ReactDOM;
        if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return React;
        throw new Error('Module not available in preview: ' + id);
      };
      const wrapped = "const exports = {}; const module = { exports }; " + out + "\\nconst __keys = Object.keys(module.exports); const __fn = __keys.find(k => typeof module.exports[k] === 'function'); return (module.exports && module.exports.default) || exports.default || (typeof App !== 'undefined' ? App : null) || (typeof Component !== 'undefined' ? Component : null) || (__fn ? module.exports[__fn] : null);";
      const factory = new Function('React', 'ReactDOM', 'require', wrapped);
      let Comp = factory(React, ReactDOM, require);
      if (Comp && typeof Comp === 'object' && typeof Comp.default === 'function') Comp = Comp.default;
      if (typeof Comp !== 'function') {
        showErr('Snippet must export default a React component function (or define App). Got: ' + (Comp === null ? 'null' : typeof Comp));
      } else {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(Comp));
      }

    } catch (e) { showErr(e?.stack || e?.message || String(e)); }
  </script>
  </body></html>`;
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
