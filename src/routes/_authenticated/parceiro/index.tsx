import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/parceiro/")({
  beforeLoad: () => { throw redirect({ to: "/parceiro/dashboard" as any }); },
  component: () => null,
});
