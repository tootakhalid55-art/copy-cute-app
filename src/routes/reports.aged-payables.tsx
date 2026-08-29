import { createFileRoute } from "@tanstack/react-router";
import { AgedReport } from "@/components/haseem/AgedReport";

export const Route = createFileRoute("/reports/aged-payables")({
  head: () => ({ meta: [{ title: "أعمار الذمم الدائنة — كنار المحاسبية" }] }),
  component: () => (
    <AgedReport
      partyType="supplier"
      title="أعمار الذمم الدائنة"
      subtitle="تحليل المستحقات للموردين من محرك التسويات"
      partyLabel="المورد"
    />
  ),
});
