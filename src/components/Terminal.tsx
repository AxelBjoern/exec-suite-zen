import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  dispatch,
  listAgents,
  listAudit,
  listTasks,
  listApprovals,
  decideApproval,
  pinDirective,
  listDirectives,
  verifyChain,
  getThread,
} from "@/serverfns/terminal.functions";
import { fetchUrlSnapshot } from "@/serverfns/integrations/research.functions";
import { queueEmail } from "@/serverfns/integrations/email.functions";
import { CommandPalette, InlineSuggestions } from "@/components/CommandPalette";
import { LibraryPanel } from "@/components/LibraryPanel";
import { ContextPanel } from "@/components/ContextPanel";
import { ArtifactCard, ConsultCard } from "@/components/ArtifactCard";
import { suggestForInput } from "@/lib/command-library";

type Agent = Awaited<ReturnType<typeof listAgents>>[number];

type Panel =
  | { kind: "thread"; agentSlug: string; threadId: string | null; title: string }
  | { kind: "boardroom"; agentSlug: string; threadId: string | null; title: string }
  | { kind: "tasks" }
  | { kind: "approvals" }
  | { kind: "audit" }
  | { kind: "leads" }
  | { kind: "manual" }
  | { kind: "library" }
  | { kind: "context" }
  | { kind: "agents" };

const HELP = `Available commands:
  :<agent> <verb> [args]      dispatch to one agent (e.g. :cfo brief FY26 burn)
  :board <agent> <verb> ...   boardroom — primary agent + auto consults
  /library                    browse the full command library
  /agents                     show roster
  /tasks                      open task inbox
  /approvals                  open approval queue
  /audit                      open hash-chained audit log
  /manual                     open instruction manual
  /leads                      open lead-gen pipeline
  /context                    edit company context (memory)
  /directive <agent> <text>   pin a standing directive
  /clear                      clear scrollback
  /verify                     verify the audit chain
  /help                       this list

Shortcuts: ⌘K palette · ↑/↓ history · Tab autocomplete

Agents: ceo, cfo, coo, cto, cmo, cco, sales, linkedin, social, seo`;

export function Terminal() {
  const qc = useQueryClient();
  const dispatchFn = useServerFn(dispatch);
  const decideFn = useServerFn(decideApproval);
  const pinFn = useServerFn(pinDirective);
  const verifyFn = useServerFn(verifyChain);
  const researchFn = useServerFn(fetchUrlSnapshot);
  const queueEmailFn = useServerFn(queueEmail);

  const agentsQ = useQuery({ queryKey: ["agents"], queryFn: () => listAgents() });
  const auditQ = useQuery({
    queryKey: ["audit"],
    queryFn: () => listAudit(),
    refetchInterval: 5000,
  });

  const agents = agentsQ.data ?? [];
  const validSlugs = useMemo(() => new Set(agents.map(a => a.slug)), [agents]);

  const [panels, setPanels] = useState<Panel[]>([{ kind: "agents" }]);
  const [active, setActive] = useState(0);
  const [scrollback, setScrollback] = useState<{ kind: "in" | "out" | "err" | "sys"; text: string }[]>([
    { kind: "sys", text: "VDNX TERMINAL · v3.1 · Authority · Auditability · Atomicity" },
    { kind: "sys", text: "type /help for commands" },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sbRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { sbRef.current?.scrollTo({ top: sbRef.current.scrollHeight }); }, [scrollback]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function pushOut(text: string, kind: "in" | "out" | "err" | "sys" = "out") {
    setScrollback(s => [...s, { kind, text }]);
  }

  function openPanel(p: Panel) {
    setPanels(prev => {
      const idx = prev.findIndex(x => JSON.stringify(x) === JSON.stringify(p));
      if (idx >= 0) { setActive(idx); return prev; }
      const next = [...prev, p];
      setActive(next.length - 1);
      return next;
    });
  }

  async function exec(line: string) {
    const cmd = line.trim();
    if (!cmd) return;
    pushOut(`: ${cmd}`, "in");
    setHistory(h => [cmd, ...h].slice(0, 100));
    setHistIdx(-1);

    if (cmd === "/help") return pushOut(HELP, "sys");
    if (cmd === "/clear") return setScrollback([]);
    if (cmd === "/agents") return openPanel({ kind: "agents" });
    if (cmd === "/tasks") return openPanel({ kind: "tasks" });
    if (cmd === "/approvals") return openPanel({ kind: "approvals" });
    if (cmd === "/audit") return openPanel({ kind: "audit" });
    if (cmd === "/manual") return openPanel({ kind: "manual" });
    if (cmd === "/leads") return openPanel({ kind: "leads" });
    if (cmd === "/library") return openPanel({ kind: "library" });
    if (cmd === "/context") return openPanel({ kind: "context" });
    if (cmd === "/verify") {
      setBusy(true);
      try {
        const r = await verifyFn();
        pushOut(JSON.stringify(r), r.ok ? "sys" : "err");
      } finally { setBusy(false); }
      return;
    }
    if (cmd.startsWith("/directive ")) {
      const rest = cmd.slice("/directive ".length);
      const [slug, ...body] = rest.split(/\s+/);
      if (!validSlugs.has(slug)) return pushOut(`unknown agent: ${slug}`, "err");
      if (!body.length) return pushOut("usage: /directive <agent> <text>", "err");
      setBusy(true);
      try {
        await pinFn({ data: { agent_slug: slug, body: body.join(" ") } });
        pushOut(`directive pinned to ${slug}`, "sys");
        qc.invalidateQueries({ queryKey: ["directives", slug] });
        qc.invalidateQueries({ queryKey: ["audit"] });
      } catch (e: any) { pushOut(e.message, "err"); }
      finally { setBusy(false); }
      return;
    }

    // boardroom: ":board <agent> <verb> args"
    if (cmd.startsWith(":board ")) {
      const rest = cmd.slice(":board ".length).trim();
      const [slug, verb, ...args] = rest.split(/\s+/);
      if (!validSlugs.has(slug)) return pushOut(`unknown agent: ${slug}`, "err");
      if (!verb) return pushOut("usage: :board <agent> <verb> [args]", "err");
      return runDispatch(slug, verb, args.join(" "), true);
    }

    // agent dispatch: ":cfo brief ..."
    if (cmd.startsWith(":")) {
      const rest = cmd.slice(1);
      const [slug, verb, ...args] = rest.split(/\s+/);
      if (!validSlugs.has(slug)) return pushOut(`unknown agent: ${slug}`, "err");
      if (!verb) return pushOut(`usage: :${slug} <verb> [args]`, "err");
      return runDispatch(slug, verb, args.join(" "), false);
    }

    pushOut(`unknown command: ${cmd}  (try /help)`, "err");
  }

  async function runDispatch(slug: string, verb: string, args: string, boardroom: boolean) {
    setBusy(true);
    pushOut(`${boardroom ? "BOARDROOM" : "DISPATCH"} → ${slug.toUpperCase()} ${verb} ${args}`, "sys");
    try {
      const r = await dispatchFn({
        data: { raw: "", agent_slug: slug, verb, args, thread_id: null, boardroom },
      });
      const agent = agents.find(a => a.slug === slug);
      openPanel({
        kind: boardroom ? "boardroom" : "thread",
        agentSlug: slug,
        threadId: r.thread_id!,
        title: `${agent?.role ?? slug} · ${verb}`,
      });
      if (r.requires_approval) {
        toast.warning("Output requires human approval", { description: "Open /approvals to sign off." });
        pushOut(`[REQUIRES APPROVAL] hash ${r.audit_hash.slice(0, 12)}…`, "err");
      } else {
        pushOut(`commit ok · hash ${r.audit_hash.slice(0, 12)}…`, "sys");
      }
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
    } catch (e: any) {
      pushOut(e.message ?? "dispatch failed", "err");
      toast.error(e.message ?? "dispatch failed");
    } finally { setBusy(false); }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const v = input;
      setInput("");
      exec(v);
    } else if (e.key === "Tab") {
      const sugg = suggestForInput(input);
      if (sugg.length) {
        e.preventDefault();
        setInput(sugg[0].template);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const ni = Math.min(history.length - 1, histIdx + 1);
      if (history[ni] !== undefined) { setHistIdx(ni); setInput(history[ni]); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const ni = histIdx - 1;
      if (ni < 0) { setHistIdx(-1); setInput(""); }
      else { setHistIdx(ni); setInput(history[ni]); }
    }
  }

  const tickerItems = (auditQ.data ?? []).slice(0, 20);
  const activePanel = panels[active];

  return (
    <div className="bg-terminal text-foreground min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-rule">
        <div className="flex items-center gap-4">
          <div className="font-serif text-xl tracking-tight">
            <span className="text-primary">VDNX</span> Terminal
          </div>
          <div className="smallcaps text-xs text-muted-foreground">
            Authority · Auditability · Atomicity
          </div>
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          <Clock />
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 min-h-0">
        {/* Roster */}
        <aside className="w-56 border-r border-rule bg-panel/60 flex flex-col">
          <div className="px-4 py-3 smallcaps text-[10px] text-muted-foreground border-b border-rule">
            Roster
          </div>
          <div className="flex-1 overflow-auto">
            {agents.map(a => (
              <button
                key={a.slug}
                onClick={() => openPanel({ kind: "thread", agentSlug: a.slug, threadId: null, title: a.role })}
                className="w-full text-left px-4 py-2.5 border-b border-rule/50 hover:bg-panel-2 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  <span className="font-mono text-[11px] uppercase text-primary">{a.slug}</span>
                </div>
                <div className="text-sm mt-0.5 text-foreground/90">{a.role}</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => openPanel({ kind: "library" })}
            className="px-4 py-2 text-[11px] smallcaps border-t border-rule hover:bg-panel-2 text-left flex items-center justify-between"
          >
            <span>Command Library</span>
            <span className="font-mono text-[10px] text-muted-foreground">⌘K</span>
          </button>
          <button
            onClick={() => openPanel({ kind: "manual" })}
            className="px-4 py-2 text-[11px] smallcaps border-t border-rule hover:bg-panel-2 text-left"
          >
            Manual v3.1
          </button>
        </aside>

        {/* Active panel area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Tabs */}
          <div className="flex items-center border-b border-rule bg-panel/40 overflow-x-auto">
            {panels.map((p, i) => (
              <div key={i} className={`flex items-center border-r border-rule ${i === active ? "bg-background" : ""}`}>
                <button
                  onClick={() => setActive(i)}
                  className={`px-4 py-2 text-[12px] font-mono ${i === active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {panelLabel(p, agents)}
                </button>
                {panels.length > 1 && (
                  <button
                    onClick={() => {
                      setPanels(prev => prev.filter((_, j) => j !== i));
                      setActive(a => Math.max(0, a >= i ? a - 1 : a));
                    }}
                    className="px-2 text-muted-foreground hover:text-destructive"
                  >×</button>
                )}
              </div>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-auto">
            {activePanel?.kind === "agents" && <AgentsPanel agents={agents} onOpen={openPanel} />}
            {activePanel?.kind === "thread" && (
              <ThreadPanel agentSlug={activePanel.agentSlug} threadId={activePanel.threadId} agents={agents} onRunCommand={exec} />
            )}
            {activePanel?.kind === "boardroom" && (
              <ThreadPanel agentSlug={activePanel.agentSlug} threadId={activePanel.threadId} agents={agents} boardroom onRunCommand={exec} />
            )}
            {activePanel?.kind === "tasks" && <TasksPanel />}
            {activePanel?.kind === "approvals" && <ApprovalsPanel onDecide={async (id, decision) => {
              await decideFn({ data: { approval_id: id, decision } });
              qc.invalidateQueries({ queryKey: ["approvals"] });
              qc.invalidateQueries({ queryKey: ["tasks"] });
              qc.invalidateQueries({ queryKey: ["audit"] });
              toast.success(`Approval ${decision}`);
            }} />}
            {activePanel?.kind === "audit" && <AuditPanel />}
            {activePanel?.kind === "leads" && <LeadsPanel />}
            {activePanel?.kind === "manual" && <ManualPanel />}
            {activePanel?.kind === "library" && (
              <LibraryPanel
                onRun={(t) => exec(t)}
                onPrefill={(t) => { setInput(t); inputRef.current?.focus(); }}
              />
            )}
            {activePanel?.kind === "context" && <ContextPanel />}
          </div>

          {/* Scrollback */}
          <div ref={sbRef} className="border-t border-rule bg-panel/30 h-44 overflow-auto px-5 py-2 font-mono text-[12px] leading-relaxed">
            {scrollback.map((s, i) => (
              <div key={i} className={
                s.kind === "in" ? "text-primary" :
                s.kind === "err" ? "text-destructive" :
                s.kind === "sys" ? "text-muted-foreground" : "text-foreground/90"
              }>
                {s.text.split("\n").map((ln, j) => <div key={j}>{ln}</div>)}
              </div>
            ))}
            {busy && <div className="text-amber">…working</div>}
          </div>

          {/* Inline suggestions */}
          {input.trim() && (input.startsWith(":") || input.startsWith("/")) && (
            <div className="px-5">
              <InlineSuggestions
                input={input}
                onPick={(c) => { setInput(c.template); inputRef.current?.focus(); }}
              />
            </div>
          )}

          {/* Command line */}
          <div className="border-t border-primary/40 bg-background px-5 py-3 flex items-center gap-3">
            <span className="font-mono text-primary">:</span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
              placeholder=":cfo brief FY26 burn scenarios   ·   ⌘K for palette   ·   /library"
              className="flex-1 bg-transparent outline-none font-mono text-[13px] text-foreground placeholder:text-muted-foreground/60"
            />
            <button
              onClick={() => setPaletteOpen(true)}
              className="font-mono text-[10px] text-muted-foreground border border-rule px-1.5 py-0.5 hover:text-primary hover:border-primary"
              title="Open command palette"
            >⌘K</button>
            <span className="font-mono text-primary caret">▍</span>
          </div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPick={(entry, mode) => {
          if (mode === "run") exec(entry.template);
          else { setInput(entry.template); setTimeout(() => inputRef.current?.focus(), 0); }
        }}
      />

      {/* Audit ticker */}
      <div className="border-t border-rule bg-panel/80 overflow-hidden ticker-mask">
        <div className="flex gap-8 whitespace-nowrap py-1.5 animate-ticker font-mono text-[11px] text-muted-foreground">
          {[...tickerItems, ...tickerItems].map((row, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-primary">●</span>
              <span>{new Date(row.created_at).toLocaleTimeString("en-GB", { hour12: false })}</span>
              <span className="uppercase text-foreground/80">{row.action}</span>
              {row.agent_slug && <span className="text-primary/80">{row.agent_slug}</span>}
              <span className="text-muted-foreground">#{row.hash_self.slice(0, 10)}</span>
            </span>
          ))}
          {tickerItems.length === 0 && (
            <span>AUDIT TICKER · idle · awaiting first command</span>
          )}
        </div>
      </div>
    </div>
  );
}

function panelLabel(p: Panel, agents: Agent[]): string {
  if (p.kind === "agents") return "ROSTER";
  if (p.kind === "tasks") return "TASKS";
  if (p.kind === "approvals") return "APPROVALS";
  if (p.kind === "audit") return "AUDIT";
  if (p.kind === "leads") return "LEADS";
  if (p.kind === "manual") return "MANUAL";
  if (p.kind === "library") return "LIBRARY";
  if (p.kind === "context") return "CONTEXT";
  const a = agents.find(x => x.slug === p.agentSlug);
  const tag = p.kind === "boardroom" ? "BOARD" : a?.slug.toUpperCase();
  return `${tag} · ${p.title}`;
}

function Clock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString("en-GB", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{now || "—"}</span>;
}

/* ───────── Panels ───────── */

function AgentsPanel({ agents, onOpen }: { agents: Agent[]; onOpen: (p: Panel) => void }) {
  return (
    <div className="p-8 max-w-6xl">
      <h1 className="font-serif text-3xl mb-1">The Executive Team</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Ten operators. Every output AI-drafted, human-approved, hash-chained.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map(a => (
          <button
            key={a.slug}
            onClick={() => onOpen({ kind: "thread", agentSlug: a.slug, threadId: null, title: a.role })}
            className="text-left border border-rule bg-panel/60 hover:border-primary/60 transition-colors p-5"
          >
            <div className="flex items-center justify-between">
              <div className="font-mono text-[11px] uppercase text-primary">{a.slug}</div>
              <div className="text-[10px] smallcaps text-muted-foreground">consult: {a.consult_with.join(" · ") || "—"}</div>
            </div>
            <div className="font-serif text-xl mt-1">{a.role}</div>
            <div className="hairline my-3" />
            <p className="text-sm text-foreground/85">{a.mandate}</p>
            <div className="text-[11px] text-muted-foreground mt-2 italic">{a.tone}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThreadPanel({
  agentSlug, threadId, agents, boardroom, onRunCommand,
}: { agentSlug: string; threadId: string | null; agents: Agent[]; boardroom?: boolean; onRunCommand?: (cmd: string) => void }) {
  const agent = agents.find(a => a.slug === agentSlug);
  const dirsQ = useQuery({
    queryKey: ["directives", agentSlug],
    queryFn: () => listDirectives({ data: { agent_slug: agentSlug } }),
  });
  const threadQ = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => threadId ? getThread({ data: { thread_id: threadId } }) : Promise.resolve(null),
    enabled: !!threadId,
    refetchInterval: 3000,
  });

  return (
    <div className="flex h-full">
      <div className="flex-1 p-8 overflow-auto">
        <div className="smallcaps text-[10px] text-muted-foreground">
          {boardroom ? "Boardroom" : "Solo briefing"} · {agent?.slug}
        </div>
        <h1 className="font-serif text-3xl mt-1">{agent?.role}</h1>
        <p className="text-muted-foreground text-sm mt-1">{agent?.mandate}</p>
        <div className="hairline my-6" />

        {!threadId && (
          <div className="font-mono text-sm text-muted-foreground border border-dashed border-rule p-6">
            No thread yet. From the command line below, dispatch:
            <div className="text-primary mt-2">:{agentSlug} brief &lt;your topic&gt;</div>
            {boardroom && <div className="text-primary">:board {agentSlug} &lt;verb&gt; ...</div>}
          </div>
        )}

        <div className="space-y-6">
          {threadQ.data?.messages.map((m: any) => {
            const senderAgent = m.role === "user" ? null : agents.find(a => a.id === m.agent_id);
            const sender = m.role === "user" ? "Operator" : senderAgent?.role ?? "Agent";
            const aj = m.artifact_json as any;
            const isConsult = aj && aj.kind === "consult";
            const isArtifact = aj && !isConsult && Array.isArray(aj.sections);
            return (
              <div key={m.id} className="border-l-2 border-primary/60 pl-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-mono text-[11px] uppercase text-primary">{sender}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {new Date(m.created_at).toLocaleTimeString("en-GB", { hour12: false })}
                  </div>
                </div>
                {isArtifact ? (
                  <ArtifactCard artifact={aj} onRunCommand={onRunCommand} />
                ) : isConsult ? (
                  <ConsultCard agentRole={sender} consult={aj} />
                ) : (
                  <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed font-serif">
                    {m.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <aside className="w-72 border-l border-rule bg-panel/40 p-5 overflow-auto">
        <div className="smallcaps text-[10px] text-muted-foreground">Mandate</div>
        <p className="text-sm mt-1">{agent?.mandate}</p>

        <div className="hairline my-4" />
        <div className="smallcaps text-[10px] text-muted-foreground">Tone</div>
        <p className="text-sm mt-1 italic">{agent?.tone}</p>

        <div className="hairline my-4" />
        <div className="smallcaps text-[10px] text-muted-foreground">Consult-with</div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {agent?.consult_with.map(s => (
            <span key={s} className="font-mono text-[10px] uppercase border border-rule px-1.5 py-0.5 text-primary">{s}</span>
          ))}
        </div>

        <div className="hairline my-4" />
        <div className="smallcaps text-[10px] text-muted-foreground">Pinned directives</div>
        {dirsQ.data?.length
          ? <ul className="mt-2 space-y-2">{dirsQ.data.map((d: any) => (
              <li key={d.id} className="text-[12px] border-l border-primary/60 pl-2">{d.body}</li>
            ))}</ul>
          : <div className="mt-2 text-[12px] text-muted-foreground">none</div>}
        <div className="mt-3 font-mono text-[10px] text-muted-foreground">
          /directive {agentSlug} &lt;text&gt;
        </div>
      </aside>
    </div>
  );
}

function TasksPanel() {
  const q = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks(), refetchInterval: 5000 });
  return (
    <div className="p-8">
      <h2 className="font-serif text-2xl mb-4">Task Inbox</h2>
      <table className="w-full font-mono text-[12px]">
        <thead className="text-muted-foreground">
          <tr className="border-b border-rule"><th className="text-left py-2">When</th><th className="text-left">Agent</th><th className="text-left">Title</th><th className="text-left">Status</th></tr>
        </thead>
        <tbody>
          {q.data?.map((t: any) => (
            <tr key={t.id} className="border-b border-rule/40">
              <td className="py-2 text-muted-foreground">{new Date(t.created_at).toLocaleString("en-GB", { hour12: false })}</td>
              <td className="text-primary uppercase">{t.agents?.slug}</td>
              <td>{t.title}</td>
              <td>
                <span className={
                  t.status === "done" ? "text-success" :
                  t.status === "blocked" ? "text-amber" :
                  "text-muted-foreground"
                }>{t.status}</span>
                {t.requires_approval && <span className="ml-2 text-amber">[gate]</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalsPanel({ onDecide }: { onDecide: (id: string, d: "approved" | "rejected") => void }) {
  const q = useQuery({ queryKey: ["approvals"], queryFn: () => listApprovals(), refetchInterval: 5000 });
  const items = (q.data ?? []).filter((a: any) => a.status === "pending");
  return (
    <div className="p-8">
      <h2 className="font-serif text-2xl mb-1">Approvals Queue</h2>
      <p className="text-sm text-muted-foreground mb-6">Authority gate — every executive-facing artefact needs a human ✓.</p>
      {items.length === 0 && <div className="font-mono text-sm text-muted-foreground">queue clear.</div>}
      <div className="space-y-4">
        {items.map((a: any) => (
          <div key={a.id} className="border border-rule bg-panel/60 p-5">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[11px] uppercase text-primary">{a.tasks?.agents?.slug}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString("en-GB", { hour12: false })}</div>
            </div>
            <div className="font-serif text-lg mt-1">{a.tasks?.title}</div>
            <div className="text-sm mt-1 text-muted-foreground">{a.tasks?.body}</div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => onDecide(a.id, "approved")} className="px-3 py-1.5 bg-primary text-primary-foreground text-[12px] font-mono uppercase hover:bg-primary/90">Approve</button>
              <button onClick={() => onDecide(a.id, "rejected")} className="px-3 py-1.5 border border-destructive text-destructive text-[12px] font-mono uppercase hover:bg-destructive/10">Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditPanel() {
  const q = useQuery({ queryKey: ["audit"], queryFn: () => listAudit(), refetchInterval: 4000 });
  return (
    <div className="p-8">
      <h2 className="font-serif text-2xl mb-1">Audit Log</h2>
      <p className="text-sm text-muted-foreground mb-6">Append-only · SHA-256 hash-chained.</p>
      <div className="font-mono text-[12px] space-y-1">
        {q.data?.map((row: any) => (
          <div key={row.id} className="grid grid-cols-[140px_70px_180px_1fr] gap-3 border-b border-rule/40 py-1">
            <span className="text-muted-foreground">{new Date(row.created_at).toLocaleString("en-GB", { hour12: false })}</span>
            <span className="text-primary uppercase">{row.agent_slug ?? "—"}</span>
            <span>{row.action}</span>
            <span className="text-muted-foreground truncate">#{row.hash_self.slice(0, 16)}…</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadsPanel() {
  return (
    <div className="p-8">
      <h2 className="font-serif text-2xl mb-1">Lead Generation</h2>
      <p className="text-sm text-muted-foreground mb-6">LinkedIn outreach pipeline · ICP → enrich → sequence → triage.</p>
      <div className="grid grid-cols-5 gap-3">
        {["new", "contacted", "replied", "booked", "closed"].map(stage => (
          <div key={stage} className="border border-rule bg-panel/60 min-h-[200px] p-3">
            <div className="smallcaps text-[10px] text-muted-foreground">{stage}</div>
            <div className="text-[12px] text-muted-foreground mt-3 font-mono">empty</div>
          </div>
        ))}
      </div>
      <div className="mt-6 font-mono text-[11px] text-muted-foreground">
        Dispatch <span className="text-primary">:linkedin draft sequence for ADGM-licensed funds</span> to seed work.
      </div>
    </div>
  );
}

function ManualPanel() {
  return (
    <div className="p-10 max-w-3xl mx-auto font-serif text-[15px] leading-relaxed">
      <div className="smallcaps text-[10px] text-muted-foreground">VDNX Agent Instruction Manual</div>
      <h1 className="text-4xl mt-1">Version 3.1</h1>
      <div className="hairline my-6" />
      <h2 className="text-2xl">1. Company Overview</h2>
      <p className="mt-2">VDNX is an institutional <em>Company Operating System</em> consolidating the operational, governance, equity, and compliance layers that modern legal entities depend on into a single audited platform — replacing fragmented spreadsheets, email board packs, PDF KYC folders, legacy share ledgers, and standalone CRMs.</p>

      <h2 className="text-2xl mt-8">2. Foundational Principles</h2>
      <p className="mt-2"><strong>Authority.</strong> Every artefact is human-approved. AI is strictly a draft layer.</p>
      <p className="mt-2"><strong>Auditability.</strong> Every material action lands in a SHA-256 hash-chained ledger.</p>
      <p className="mt-2"><strong>Atomicity.</strong> Governance, ownership, payments, and compliance are atomic with role-based security.</p>

      <h2 className="text-2xl mt-8">3. Universal Operating Standard</h2>
      <p className="mt-2">Every executive output follows: <em>Situation → Analysis → Options → Recommendation → Next Steps</em>. Active voice. No filler. Founder-grade urgency.</p>

      <h2 className="text-2xl mt-8">4. Escalation & Collaboration Matrix</h2>
      <ul className="mt-2 list-disc pl-6 text-[14px]">
        <li>CEO → consults all C-level</li>
        <li>CFO, COO, CMO → CEO</li>
        <li>CTO → CEO, CCO</li>
        <li>CCO → CEO, CTO, CFO</li>
        <li>Head of Sales → CEO, CMO, CCO</li>
        <li>LinkedIn Specialist → Head of Sales, CMO</li>
        <li>Social Media Expert → CMO (CEO sign-off on executive content)</li>
        <li>SEO Expert → CMO</li>
      </ul>

      <div className="hairline my-8" />
      <p className="text-sm text-muted-foreground italic">Approved by CEO · VDNX — The Operating Layer for the Modern Company.</p>
    </div>
  );
}
