import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/purchases/debit-notes")({
  head: () => ({ meta: [{ title: "الإشعارات المدينة — كنار المحاسبية" }] }),
  component: () => <Outlet />,
});

