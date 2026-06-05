import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings as SettingsIcon, Plug, Mail, Linkedin, Palette } from "lucide-react";
import { getMySettings, updateMySettings, getConnectorStatus } from "@/lib/connections.functions";

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
              Gmail — {gmail ? <strong>{gmail.provider_email ?? "connected"}</strong> : <span className="text-muted-foreground">not connected</span>}
            </span>
            <Link to="/settings/connections" className="text-xs font-semibold uppercase tracking-wider text-primary hover:opacity-80">
              Manage →
            </Link>
          </li>
          <li className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn — {linkedin ? <strong>{linkedin.provider_name ?? linkedin.provider_email ?? "connected"}</strong> : <span className="text-muted-foreground">not connected</span>}
            </span>
            <Link to="/settings/connections" className="text-xs font-semibold uppercase tracking-wider text-primary hover:opacity-80">
              Manage →
            </Link>
          </li>
        </ul>
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
    </main>
  );
}
