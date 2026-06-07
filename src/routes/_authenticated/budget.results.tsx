import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/budget/results")({
  ssr: false,
  component: Placeholder,
});

function Placeholder() {
  return (
    <div className="rounded-lg border border-border bg-panel px-6 py-10 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">results</p>
      <p className="mt-2 text-sm text-muted-foreground">Coming in Wave B.</p>
    </div>
  );
}
