import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ArtifactJson = {
  title: string;
  sections: { heading: string; body_md: string }[];
  action_items: {
    task: string;
    owner_agent: string;
    deliverable: string;
    due: string;
    auto_dispatch: boolean;
  }[];
  requires_external_approval: boolean;
  suggested_next_commands: string[];
};

export function ArtifactCard({
  artifact,
  onRunCommand,
}: {
  artifact: ArtifactJson;
  onRunCommand?: (cmd: string) => void;
}) {
  return (
    <article className="border border-rule bg-panel/40 p-6 my-2">
      <header className="border-b border-rule pb-3 mb-4 flex items-start justify-between gap-4">
        <h2 className="font-serif text-2xl leading-tight">{artifact.title}</h2>
        {artifact.requires_external_approval && (
          <span className="font-mono text-[10px] uppercase text-amber border border-amber/60 px-2 py-0.5 shrink-0">
            Awaiting approval
          </span>
        )}
      </header>

      <div className="space-y-5">
        {artifact.sections.map((s, i) => (
          <section key={i}>
            <h3 className="smallcaps text-[11px] text-primary mb-1.5">{s.heading}</h3>
            <div className="prose prose-sm prose-invert max-w-none font-serif text-[14px] leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.body_md}</ReactMarkdown>
            </div>
          </section>
        ))}
      </div>

      {artifact.action_items.length > 0 && (
        <section className="mt-6 border-t border-rule pt-4">
          <h3 className="smallcaps text-[11px] text-primary mb-2">Action items</h3>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[12px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-rule/60">
                  <th className="text-left py-1.5 pr-3">#</th>
                  <th className="text-left pr-3">Task</th>
                  <th className="text-left pr-3">Owner</th>
                  <th className="text-left pr-3">Deliverable</th>
                  <th className="text-left pr-3">Due</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {artifact.action_items.map((it, i) => (
                  <tr key={i} className="border-b border-rule/30 align-top">
                    <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="pr-3">{it.task}</td>
                    <td className="pr-3 text-primary uppercase">{it.owner_agent}</td>
                    <td className="pr-3 text-foreground/80">{it.deliverable}</td>
                    <td className="pr-3 text-muted-foreground">{it.due}</td>
                    <td>
                      {it.auto_dispatch ? (
                        <span className="text-success">auto ✓</span>
                      ) : (
                        <span className="text-amber">gated</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {artifact.suggested_next_commands.length > 0 && (
        <section className="mt-5">
          <h3 className="smallcaps text-[11px] text-muted-foreground mb-2">Next</h3>
          <div className="flex flex-wrap gap-2">
            {artifact.suggested_next_commands.map((c, i) => (
              <button
                key={i}
                onClick={() => onRunCommand?.(c)}
                className="font-mono text-[11px] border border-rule px-2 py-1 hover:border-primary hover:text-primary transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

export function ConsultCard({
  agentRole,
  consult,
}: {
  agentRole: string;
  consult: {
    position: "agree" | "disagree" | "amend";
    rationale: string;
    amendments: string[];
    blocking: boolean;
  };
}) {
  const color =
    consult.position === "agree"
      ? "text-success border-success/60"
      : consult.position === "disagree"
      ? "text-destructive border-destructive/60"
      : "text-amber border-amber/60";
  return (
    <article className="border border-rule bg-panel/30 p-4 my-2">
      <header className="flex items-baseline justify-between gap-3 mb-2">
        <div className="font-mono text-[11px] uppercase text-primary">{agentRole}</div>
        <span className={`font-mono text-[10px] uppercase border px-2 py-0.5 ${color}`}>
          {consult.position}{consult.blocking ? " · blocking" : ""}
        </span>
      </header>
      <p className="font-serif text-[14px] leading-relaxed">{consult.rationale}</p>
      {consult.amendments.length > 0 && (
        <div className="mt-3">
          <div className="smallcaps text-[10px] text-muted-foreground mb-1">Amendments</div>
          <ul className="list-disc pl-5 text-[13px] space-y-1">
            {consult.amendments.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </article>
  );
}
