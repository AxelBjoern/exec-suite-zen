export type CommandCategory = "system" | "agent" | "boardroom" | "shortcut";

export type CommandEntry = {
  id: string;
  category: CommandCategory;
  syntax: string;          // displayed verbatim
  template: string;        // what we put in the input on "Run" / palette select
  summary: string;
  example?: string;
  agent?: string;          // slug, for agent verbs
  needsArgs?: boolean;     // if true, palette/Run prefills instead of executing
};

const SYSTEM: CommandEntry[] = [
  { id: "help",       category: "system", syntax: "/help",       template: "/help",       summary: "List commands and shortcuts." },
  { id: "library",    category: "system", syntax: "/library",    template: "/library",    summary: "Open the command library." },
  { id: "agents",     category: "system", syntax: "/agents",     template: "/agents",     summary: "Open the executive roster." },
  { id: "tasks",      category: "system", syntax: "/tasks",      template: "/tasks",      summary: "Open the task inbox." },
  { id: "approvals",  category: "system", syntax: "/approvals",  template: "/approvals",  summary: "Open the human approval queue." },
  { id: "audit",      category: "system", syntax: "/audit",      template: "/audit",      summary: "Open the SHA-256 hash-chained audit log." },
  { id: "leads",      category: "system", syntax: "/leads",      template: "/leads",      summary: "Open the lead-gen pipeline." },
  { id: "manual",     category: "system", syntax: "/manual",     template: "/manual",     summary: "Open the VDNX instruction manual v3.1." },
  { id: "verify",     category: "system", syntax: "/verify",     template: "/verify",     summary: "Verify the integrity of the audit chain." },
  { id: "clear",      category: "system", syntax: "/clear",      template: "/clear",      summary: "Clear the scrollback." },
  { id: "directive",  category: "system", syntax: "/directive <agent> <text>", template: "/directive ", summary: "Pin a standing directive to an agent.", needsArgs: true, example: "/directive cfo Always model base/best/worst." },
];

type Verb = { verb: string; summary: string; example?: string };

const VERBS: Record<string, Verb[]> = {
  ceo: [
    { verb: "strategy",            summary: "Full strategic plan for a horizon or theme.", example: "Q3 2026" },
    { verb: "board_deck",          summary: "Complete board presentation.", example: "Series A" },
    { verb: "vision",              summary: "Vision + narrative refresh.", example: "2027" },
    { verb: "capital_allocation",  summary: "Capital deployment plan across bets.", example: "2026" },
    { verb: "quarterly_goals",     summary: "Company priorities + OKRs for the quarter.", example: "Q3" },
  ],
  cfo: [
    { verb: "brief",      summary: "Finance brief: burn, runway, unit economics.", example: "FY26 burn scenarios base/best/worst" },
    { verb: "model",      summary: "Build a quick model with assumptions stated.", example: "ARR ramp at 12% net new logos" },
    { verb: "forecast",   summary: "12-month rolling forecast with sensitivities." },
    { verb: "variance",   summary: "Plan-vs-actual variance commentary." },
    { verb: "board-pack", summary: "Assemble the finance section of the board pack." },
  ],
  coo: [
    { verb: "sop",      summary: "Draft a standard operating procedure.", example: "Incident response P1" },
    { verb: "runbook",  summary: "Operational runbook for a workflow." },
    { verb: "incident", summary: "Incident report and corrective actions." },
    { verb: "okr",      summary: "Quarterly OKRs for a team or function." },
    { verb: "status",   summary: "Weekly operational status." },
  ],
  cto: [
    { verb: "architect",  summary: "Architecture proposal with trade-offs." },
    { verb: "rfc",        summary: "Engineering RFC.", example: "Multi-tenant data isolation" },
    { verb: "postmortem", summary: "Blameless postmortem." },
    { verb: "roadmap",    summary: "Engineering roadmap by quarter." },
    { verb: "review-pr",  summary: "Senior code review checklist." },
  ],
  cmo: [
    { verb: "campaign",    summary: "Integrated campaign brief." },
    { verb: "positioning", summary: "Positioning statement and message house." },
    { verb: "launch",      summary: "Launch plan with channels and milestones." },
    { verb: "narrative",   summary: "Company narrative one-pager." },
    { verb: "calendar",    summary: "Editorial calendar for a quarter." },
  ],
  cco: [
    { verb: "policy",      summary: "Draft or update a compliance policy." },
    { verb: "kyc-review",  summary: "KYC/AML review of a counterparty." },
    { verb: "risk-memo",   summary: "Risk memo with mitigations." },
    { verb: "audit-prep",  summary: "Audit preparation checklist." },
    { verb: "disclosure",  summary: "Regulatory disclosure draft." },
  ],
  sales: [
    { verb: "outbound",    summary: "Outbound sequence for a segment.", example: "Series-B fintech CFOs" },
    { verb: "proposal",    summary: "Commercial proposal." },
    { verb: "pipeline",    summary: "Pipeline review with risk flags." },
    { verb: "discovery",   summary: "Discovery call agenda and questions." },
    { verb: "close-plan",  summary: "Mutual close plan for a deal." },
  ],
  linkedin: [
    { verb: "post",             summary: "Single LinkedIn post in founder voice." },
    { verb: "comment-strategy", summary: "Daily commenting plan on target accounts." },
    { verb: "dm-sequence",      summary: "DM outreach sequence." },
    { verb: "profile-audit",    summary: "Audit a LinkedIn profile and recommend edits." },
  ],
  social: [
    { verb: "thread",      summary: "Long-form X/threads piece." },
    { verb: "caption",     summary: "Caption pack for a launch." },
    { verb: "calendar",    summary: "Social calendar for the week." },
    { verb: "trend-brief", summary: "Trend brief with angle recommendations." },
  ],
  seo: [
    { verb: "keyword-map",   summary: "Keyword map with intent and difficulty." },
    { verb: "brief",         summary: "SEO content brief." },
    { verb: "audit",         summary: "Technical + on-page SEO audit." },
    { verb: "backlink-plan", summary: "Backlink acquisition plan." },
  ],
};

const AGENT: CommandEntry[] = Object.entries(VERBS).flatMap(([slug, verbs]) =>
  verbs.map<CommandEntry>(v => ({
    id: `${slug}.${v.verb}`,
    category: "agent",
    agent: slug,
    syntax: `:${slug} ${v.verb} <args>`,
    template: `:${slug} ${v.verb} `,
    summary: v.summary,
    example: v.example ? `:${slug} ${v.verb} ${v.example}` : undefined,
    needsArgs: true,
  }))
);

const BOARDROOM: CommandEntry[] = Object.keys(VERBS).map(slug => ({
  id: `board.${slug}`,
  category: "boardroom",
  agent: slug,
  syntax: `:board ${slug} <verb> <args>`,
  template: `:board ${slug} `,
  summary: `Boardroom: ${slug.toUpperCase()} leads, peers consult automatically.`,
  needsArgs: true,
}));

const SHORTCUTS: CommandEntry[] = [
  { id: "sc.palette", category: "shortcut", syntax: "Ctrl/Cmd + K", template: "", summary: "Open the command palette." },
  { id: "sc.history", category: "shortcut", syntax: "↑ / ↓",        template: "", summary: "Cycle through previous commands." },
  { id: "sc.tab",     category: "shortcut", syntax: "Tab",          template: "", summary: "Accept the top autocomplete suggestion." },
  { id: "sc.esc",     category: "shortcut", syntax: "Esc",          template: "", summary: "Close palette / clear input." },
];

export const COMMAND_LIBRARY: CommandEntry[] = [
  ...SYSTEM, ...AGENT, ...BOARDROOM, ...SHORTCUTS,
];

export const CATEGORIES: { id: CommandCategory; label: string }[] = [
  { id: "system",    label: "System" },
  { id: "agent",     label: "Agent verbs" },
  { id: "boardroom", label: "Boardroom" },
  { id: "shortcut",  label: "Shortcuts" },
];

export function searchCommands(q: string, category?: CommandCategory, agent?: string): CommandEntry[] {
  const needle = q.trim().toLowerCase();
  return COMMAND_LIBRARY.filter(c => {
    if (category && c.category !== category) return false;
    if (agent && c.agent !== agent) return false;
    if (!needle) return true;
    return (
      c.syntax.toLowerCase().includes(needle) ||
      c.summary.toLowerCase().includes(needle) ||
      (c.agent ?? "").toLowerCase().includes(needle) ||
      (c.example ?? "").toLowerCase().includes(needle)
    );
  });
}

export function suggestForInput(input: string, limit = 6): CommandEntry[] {
  const v = input.trim();
  if (!v) return [];
  const isCmd = v.startsWith(":") || v.startsWith("/");
  if (!isCmd) return [];
  const lower = v.toLowerCase();
  return COMMAND_LIBRARY
    .filter(c => c.category !== "shortcut")
    .filter(c => c.template.toLowerCase().startsWith(lower) || c.syntax.toLowerCase().startsWith(lower))
    .slice(0, limit);
}
