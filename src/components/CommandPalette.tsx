import { useEffect, useMemo, useRef, useState } from "react";
import { COMMAND_LIBRARY, suggestForInput, type CommandEntry } from "@/lib/command-library";

export function CommandPalette({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (entry: CommandEntry, mode: "run" | "prefill") => void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ(""); setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return COMMAND_LIBRARY.filter(c => c.category !== "shortcut").slice(0, 30);
    return COMMAND_LIBRARY
      .filter(c => c.category !== "shortcut")
      .filter(c =>
        c.syntax.toLowerCase().includes(needle) ||
        c.summary.toLowerCase().includes(needle) ||
        (c.agent ?? "").includes(needle))
      .slice(0, 50);
  }, [q]);

  if (!open) return null;

  function pick(e: CommandEntry) {
    onPick(e, e.needsArgs ? "prefill" : "run");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[640px] max-w-[92vw] border border-rule bg-panel shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-rule px-4 py-3 flex items-center gap-3">
          <span className="font-mono text-primary">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={e => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); const r = results[idx]; if (r) pick(r); }
            }}
            placeholder="Search commands… (e.g. cfo brief, /audit, board)"
            className="flex-1 bg-transparent outline-none font-mono text-[13px]"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="text-[10px] text-muted-foreground font-mono">esc</span>
        </div>
        <div className="max-h-[55vh] overflow-auto">
          {results.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground font-mono">no matches</div>
          )}
          {results.map((c, i) => (
            <button
              key={c.id}
              onClick={() => pick(c)}
              onMouseEnter={() => setIdx(i)}
              className={`w-full text-left px-4 py-2.5 border-b border-rule/40 flex items-baseline gap-3 ${i === idx ? "bg-panel-2" : ""}`}
            >
              <span className="font-mono text-[12px] text-primary min-w-[220px] truncate">{c.syntax}</span>
              <span className="text-[12px] text-foreground/85 truncate">{c.summary}</span>
              <span className="ml-auto text-[10px] smallcaps text-muted-foreground">{c.category}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-rule px-4 py-2 flex justify-between text-[10px] font-mono text-muted-foreground">
          <span>↑↓ navigate · ↵ run/prefill · esc close</span>
          <span>{results.length} commands</span>
        </div>
      </div>
    </div>
  );
}

export function InlineSuggestions({
  input, onPick,
}: {
  input: string;
  onPick: (e: CommandEntry) => void;
}) {
  const items = suggestForInput(input);
  if (items.length === 0) return null;
  return (
    <div className="border border-rule bg-panel/95 backdrop-blur-sm shadow-lg max-h-56 overflow-auto">
      {items.map((c, i) => (
        <button
          key={c.id}
          onClick={() => onPick(c)}
          className="w-full text-left px-3 py-1.5 hover:bg-panel-2 flex items-baseline gap-3 border-b border-rule/30"
        >
          <span className="font-mono text-[12px] text-primary min-w-[200px] truncate">{c.syntax}</span>
          <span className="text-[11px] text-muted-foreground truncate">{c.summary}</span>
          {i === 0 && <span className="ml-auto text-[9px] font-mono text-muted-foreground">tab</span>}
        </button>
      ))}
    </div>
  );
}
