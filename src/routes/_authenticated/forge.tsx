import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/forge")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/agents-models" });
  },
  component: () => null,
});
