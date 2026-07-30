import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/purchases/bills")({
  head: () => ({ meta: [{ title: "فواتير المشتريات — كنار المحاسبية" }] }),
  component: () => <Outlet />,
});

