import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sales/credit-notes")({
  head: () => ({ meta: [{ title: "الإشعارات الدائنة — حسيم" }] }),
  component: () => <Outlet />,
});
