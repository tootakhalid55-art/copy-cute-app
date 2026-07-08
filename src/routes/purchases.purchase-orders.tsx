import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/purchases/purchase-orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — حسيم" }] }),
  component: () => <Outlet />,
});
