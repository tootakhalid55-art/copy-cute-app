import { createFileRoute } from "@tanstack/react-router";
import { AgedReport } from "@/components/haseem/AgedReport";

export const Route = createFileRoute("/reports/aged-receivables")({
  head: () => ({ meta: [{ title: "أعمار الذمم المدينة — كنار المحاسبية" }] }),
  component: () => (
    <AgedReport
      partyType="customer"
      title="أعمار الذمم المدينة"
      subtitle="تحليل المستحقات على العملاء من محرك التسويات"
      partyLabel="العميل"
    />
  ),
});
