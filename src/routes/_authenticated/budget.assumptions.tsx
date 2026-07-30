import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveScenario, useBudgetStore, useBudgetUi } from "@/lib/budget/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/budget/SectionHeader";
import { CHANNELS, type ChannelKey } from "@/lib/budget/types";

export const Route = createFileRoute("/_authenticated/budget/assumptions")({
  ssr: false,
  component: AssumptionsPage,
});

function AssumptionsPage() {
  const active = useActiveScenario();
  const selectedYear = useBudgetUi((s) => s.selectedYear);
  const updateYear = useBudgetStore((s) => s.updateYear);

  const yearIndex = useMemo(() => {
    if (!active) return 0;
    return Math.max(0, selectedYear - active.assumptions.startYear);
  }, [active, selectedYear]);

  if (!active) return <Empty />;
  const y = active.assumptions.perYear[yearIndex];
  const locked = !!active.isLocked;

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        title={`Assumptions · ${selectedYear}`}
        description={locked ? "Scenario is locked — values are read-only." : "Edits autosave to your workspace."}
      />

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">New customers by channel</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CHANNELS.map((c) => (
            <Field
              key={c.key}
              label={c.label}
              value={y.newCustomersByChannel[c.key]}
              disabled={locked}
              onChange={(v) =>
                updateYear(active.id, yearIndex, {
                  newCustomersByChannel: { ...y.newCustomersByChannel, [c.key as ChannelKey]: num(v) },
                })
              }
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing & volume</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Starting customers" value={y.startingCustomers} disabled={locked || yearIndex > 0}
            onChange={(v) => updateYear(active.id, yearIndex, { startingCustomers: num(v) })} />
          <Field label="COGS % of revenue" value={y.cogsPct} step="0.01" disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { cogsPct: Math.max(0, Math.min(1, num(v))) })} />

          <Field label="Surcharge %" value={y.surchargePct} step="0.01" disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { surchargePct: num(v) })} />
          <Field label="Subscription /cust/yr" value={y.subscriptionPerCustomerYear} disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { subscriptionPerCustomerYear: num(v) })} />
          <Field label="Extra services /cust/yr" value={y.extraServicesPerCustomerYear} disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { extraServicesPerCustomerYear: num(v) })} />
          <Field label="Churn rate" value={y.churnRate} step="0.01" disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { churnRate: num(v) })} />
          <Field label="CAC (SEK)" value={y.acquisitionCostPerCustomer} disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { acquisitionCostPerCustomer: num(v) })} />
          <Field label="Invoicing /cust" value={y.invoicingCostPerCustomer} disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { invoicingCostPerCustomer: num(v) })} />
          <Field label="Sales start month" value={y.salesStartMonth ?? 1} disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { salesStartMonth: Math.max(1, Math.min(12, num(v))) })} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overheads</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Other external (yr)" value={y.otherExternalExpenses} disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { otherExternalExpenses: num(v) })} />
          <Field label="Social fees %" value={y.socialFeesPct} step="0.01" disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { socialFeesPct: num(v) })} />
          <Field label="Loan interest (yr)" value={y.loanInterest} disabled={locked}
            onChange={(v) => updateYear(active.id, yearIndex, { loanInterest: num(v) })} />
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, disabled, step }: { label: string; value: number; onChange: (v: string) => void; disabled?: boolean; step?: string }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step ?? "1"}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 tabular-nums"
      />
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">No scenario selected.</p>;
}
