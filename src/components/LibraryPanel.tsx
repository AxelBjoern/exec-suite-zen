import { useMemo, useRef, useState, useEffect } from "react";
import { CATEGORIES, COMMAND_LIBRARY, searchCommands, type CommandCategory, type CommandEntry } from "@/lib/command-library";

const AGENT_SLUGS = ["ceo","cfo","coo","cto","cmo","cco","sales","linkedin","social","seo"];

export function LibraryPanel({
  onRun, onPrefill,
}: {
  onRun: (template: string) => void;
  onPrefill: (template: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CommandCategory | "all">("all");
  const [agent, setAgent] = useState<string | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    return searchCommands(
      q,
      cat === "all" ? undefined : cat,
      agent === "all" ? undefined : agent,
    );
  }, [q, cat, agent]);

  function handle(c: CommandEntry) {
    if (c.category === "shortcut") return;
    if (c.needsArgs) onPrefill(c.template);
    else onRun(c.template);
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: COMMAND_LIBRARY.length };
    for (const c of CATEGORIES) m[c.id] = COMMAND_LIBRARY.filter(x => x.category === c.id).length;
    return m;
  }, []);

  return (
    <div className="flex h-full">
      {/* Left rail */}
      <aside className="w-60 border-r border-rule bg-panel/40 p-4 overflow-auto shrink-0">
        <div className="smallcaps text-[10px] text-muted-foreground mb-2">Categories</div>
        <div className="space-y-1">
          <CatBtn active={cat === "all"} onClick={() => setCat("all")} label="All" count={counts.all} />
          {CATEGORIES.map(c => (
            <CatBtn key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} label={c.label} count={counts[c.id]} />
          ))}
        </div>

        <div className="smallcaps text-[10px] text-muted-foreground mt-6 mb-2">Filter by agent</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={agent === "all"} onClick={() => setAgent("all")} label="all" />
          {AGENT_SLUGS.map(s => (
            <Chip key={s} active={agent === s} onClick={() => setAgent(s)} label={s} />
          ))}
        </div>
      </aside>

      {/* Right: results */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-8 pt-8 pb-4">
          <div className="smallcaps text-[10px] text-muted-foreground">Reference</div>
          <h1 className="font-serif text-3xl mt-1">Command Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every command the terminal understands. Press <kbd className="font-mono text-primary">⌘K</kbd> anywhere for the palette, or <kbd className="font-mono text-primary">/</kbd> here to focus search.
          </p>
        </div>

        <div className="px-8 sticky top-0 bg-background/95 backdrop-blur-sm pb-3 border-b border-rule">
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search syntax, summary, agent…"
            className="w-full bg-panel/60 border border-rule px-3 py-2 font-mono text-[13px] outline-none focus:border-primary"
            spellCheck={false}
          />
        </div>

        <div className="flex-1 overflow-auto">
          <div className="px-8 py-4">
            {results.length === 0 && (
              <div className="font-mono text-sm text-muted-foreground py-8">no matches</div>
            )}
            <div className="divide-y divide-rule/40">
              {results.map(c => (
                <div key={c.id} className="py-3 flex items-baseline gap-4 group">
                  <div className="min-w-[260px]">
                    <div className="font-mono text-[13px] text-primary">{c.syntax}</div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] smallcaps text-muted-foreground">{c.category}</span>
                      {c.agent && <span className="text-[9px] smallcaps text-muted-foreground">· {c.agent}</span>}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] text-foreground/90">{c.summary}</div>
                    {c.example && (
                      <div className="font-mono text-[11px] text-muted-foreground mt-1">{c.example}</div>
                    )}
                  </div>
                  {c.category !== "shortcut" && (
                    <button
                      onClick={() => handle(c)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 border border-primary/60 text-primary text-[11px] font-mono uppercase hover:bg-primary hover:text-primary-foreground"
                    >
                      {c.needsArgs ? "Prefill" : "Run"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CatBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2 py-1.5 text-[12px] font-mono ${active ? "bg-panel-2 text-primary" : "text-foreground/80 hover:bg-panel-2/60"}`}
    >
      <span>{label}</span>
      <span className="text-muted-foreground text-[10px]">{count}</span>
    </button>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${active ? "border-primary text-primary bg-primary/10" : "border-rule text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
    >
      {label}
    </button>
  );
}
