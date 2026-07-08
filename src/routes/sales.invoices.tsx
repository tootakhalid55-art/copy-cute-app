import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sales/invoices")({
  head: () => ({ meta: [{ title: "فواتير المبيعات — حسيم" }] }),
  component: () => <Outlet />,
});
