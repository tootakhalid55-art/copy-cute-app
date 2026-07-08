import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sales/quotations")({
  head: () => ({ meta: [{ title: "عروض الأسعار — حسيم" }] }),
  component: () => <Outlet />,
});
