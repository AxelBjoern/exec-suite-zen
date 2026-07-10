import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings as SettingsIcon, Plug, Mail, Linkedin, Github, Palette, Cpu, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { getMySettings, updateMySettings, getConnectorStatus } from "@/lib/connections.functions";
import { getMyGithubStatus } from "@/lib/user-github.functions";
import { ensureOwnerRole } from "@/lib/outbound.functions";
import {
  listAutoApproveRules,
  createAutoApproveRule,
  toggleAutoApproveRule,
  deleteAutoApproveRule,
} from "@/lib/automation.functions";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [
      { title: "VDNX — Settings" },
      { name: "description", content: "Connections and outbound guardrail settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const get = useServerFn(getMySettings);
  const update = useServerFn(updateMySettings);
  const status = useServerFn(getConnectorStatus);

  const settings = useQuery({ queryKey: ["my-settings"], queryFn: () => get() });
  const connectorStatus = useQuery({ queryKey: ["connector-status"], queryFn: () => status() });
  const githubStatusFn = useServerFn(getMyGithubStatus);
  const githubStatus = useQuery({ queryKey: ["my-github"], queryFn: () => githubStatusFn() });

  const [email, setEmail] = useState(false);
  const [li, setLi] = useState(false);
  const [designRules, setDesignRules] = useState("");
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setEmail(settings.data.auto_send_email);
      setLi(settings.data.auto_send_linkedin);
      setDesignRules(settings.data.design_rules ?? "");
      setDefaultApplied(!!settings.data.design_rules_default_applied);
    }
  }, [settings.data]);

  async function save() {
    setSaving(true);
    try {
      await update({
        data: {
          auto_send_email: email,
          auto_send_linkedin: li,
          design_rules: designRules.trim() || null,
        },
      });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["my-settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const gmailConnected = connectorStatus.data?.gmail ?? false;
  const linkedinConnected = connectorStatus.data?.linkedin ?? false;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-4 w-4 text-primary" />
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Settings</p>
      </div>
      <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Your account</h1>

      <section className="mt-8 rounded-lg border border-border bg-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">Connections</h2>
        </div>
        <ul className="space-y-2">
          <li className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Gmail — {gmailConnected ? <strong>workspace connector</strong> : <span className="text-muted-foreground">not connected</span>}
            </span>
            <Link to="/settings/connections" className="text-xs font-semibold uppercase tracking-wider text-primary hover:opacity-80">
              Manage →
            </Link>
          </li>
          <li className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn — {linkedinConnected ? <strong>workspace connector</strong> : <span className="text-muted-foreground">not connected</span>}
            </span>
            <Link to="/settings/connections" className="text-xs font-semibold uppercase tracking-wider text-primary hover:opacity-80">
              Manage →
            </Link>
          </li>
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-panel p-5">
        <div className="mb-2 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">Chat models</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Enable or disable which models show up in your chat picker.
        </p>
        <Link
          to="/settings/models"
          className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/10"
        >
          Manage models →
        </Link>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-panel p-5">
        <h2 className="mb-1 font-serif text-lg font-semibold">Guardrail</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          When OFF (default), every outbound request is queued for owner approval. When ON, your own requests send immediately via your connected account — no owner approval needed.
        </p>
        <div className="grid gap-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Auto-send emails from my Gmail</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={email}
              onChange={(e) => setEmail(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Auto-publish LinkedIn posts from my account</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={li}
              onChange={(e) => setLi(e.target.checked)}
            />
          </label>
          <button
            className="mt-2 inline-flex w-fit items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-panel p-5">
        <div className="mb-2 flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">LinkedIn image design rules</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Brand/style guardrails injected into every LinkedIn image prompt (colors, typography, mood, things to avoid). Leave blank to use the model's defaults.
          {defaultApplied && (
            <span className="ml-1 italic text-primary">VDNX defaults pre-filled — edit and save to lock them in.</span>
          )}
        </p>
        <textarea
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
          rows={10}
          placeholder={`e.g.\nColor palette: deep navy + a single warm gold accent.\nTypography: bold geometric sans-serif.\nMood: institutional, calm authority.\nAvoid: emoji, stock photo cliches, purple gradients.`}
          value={designRules}
          onChange={(e) => setDesignRules(e.target.value)}
          maxLength={4000}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{designRules.length} / 4000</span>
          <button
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <AutoApproveRulesSection />
    </main>
  );
}

const RULE_KIND_OPTIONS = [
  { value: "outbound_email", label: "Email" },
  { value: "outbound_linkedin", label: "LinkedIn" },
  { value: "outbound_reminder", label: "Reminder" },
] as const;

function AutoApproveRulesSection() {
  const qc = useQueryClient();
  const ownerFn = useServerFn(ensureOwnerRole);
  const listFn = useServerFn(listAutoApproveRules);
  const createFn = useServerFn(createAutoApproveRule);
  const toggleFn = useServerFn(toggleAutoApproveRule);
  const deleteFn = useServerFn(deleteAutoApproveRule);

  const owner = useQuery({
    queryKey: ["ensure-owner"],
    queryFn: () => ownerFn({ data: undefined as never }),
    staleTime: Infinity,
  });
  const rules = useQuery({
    queryKey: ["auto-approve-rules"],
    queryFn: () => listFn(),
    enabled: owner.data?.isOwner === true,
  });

  const [kind, setKind] = useState<(typeof RULE_KIND_OPTIONS)[number]["value"]>("outbound_reminder");
  const [agentSlug, setAgentSlug] = useState("");
  const [matchJson, setMatchJson] = useState("{}");
  const [busy, setBusy] = useState(false);

  if (!owner.data?.isOwner) return null;

  async function add() {
    let match: Record<string, unknown> = {};
    try {
      match = JSON.parse(matchJson || "{}");
    } catch {
      toast.error("Match must be valid JSON");
      return;
    }
    setBusy(true);
    try {
      await createFn({
        data: {
          kind,
          agent_slug: agentSlug.trim() || null,
          match,
          enabled: true,
        },
      });
      setAgentSlug("");
      setMatchJson("{}");
      qc.invalidateQueries({ queryKey: ["auto-approve-rules"] });
      toast.success("Rule added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, enabled: boolean) {
    await toggleFn({ data: { id, enabled } });
    qc.invalidateQueries({ queryKey: ["auto-approve-rules"] });
  }

  async function remove(id: string) {
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["auto-approve-rules"] });
  }

  return (
    <section className="mt-4 rounded-lg border border-border bg-panel p-5">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="font-serif text-lg font-semibold">Auto-approve rules</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Low-risk outbound matching these rules is auto-approved by the sweeper (every 15min). Leave fields blank to match all of that kind. <strong>Match</strong> is a JSON object — e.g.{" "}
        <code className="text-[10px]">{`{"to":"me@example.com"}`}</code> only matches that recipient.
      </p>

      <div className="grid gap-2 sm:grid-cols-[160px_160px_1fr_auto] items-end">
        <label className="text-xs">
          <span className="block text-muted-foreground">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {RULE_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Agent slug (optional)</span>
          <input
            value={agentSlug}
            onChange={(e) => setAgentSlug(e.target.value)}
            placeholder="cmo, cso, …"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground">Match (JSON)</span>
          <input
            value={matchJson}
            onChange={(e) => setMatchJson(e.target.value)}
            placeholder='{"to":"me@example.com"}'
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <button
          onClick={add}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      <ul className="mt-4 space-y-1.5">
        {(rules.data?.rows ?? []).length === 0 && (
          <li className="text-xs text-muted-foreground">No rules yet — every outbound goes to your queue.</li>
        )}
        {(rules.data?.rows ?? []).map((r: any) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <span className="font-mono text-[11px] text-primary">{r.kind}</span>
              {r.agent_slug && <span className="ml-2 text-muted-foreground">agent: {r.agent_slug}</span>}
              <span className="ml-2 text-muted-foreground">match: <code>{JSON.stringify(r.match)}</code></span>
            </div>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => toggle(r.id, e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span className="text-muted-foreground">on</span>
            </label>
            <button
              onClick={() => remove(r.id)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
