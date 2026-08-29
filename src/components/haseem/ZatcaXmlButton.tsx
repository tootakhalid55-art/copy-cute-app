// Row action: generate/download the ZATCA Phase-2 UBL XML for a posted
// sales invoice (reserves the ICV/PIH chain slot on first use).
import { useState } from "react";
import { FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useOrg } from "@/lib/db/org";
import { generateZatcaInvoice } from "@/lib/zatca/zatca.functions";

export function ZatcaXmlButton({ row }: { row: any }) {
  const { currentOrgId } = useOrg();
  const gen = useServerFn(generateZatcaInvoice);
  const [busy, setBusy] = useState(false);
  if (!currentOrgId || row.status !== "مرحل") return null;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res: any = await gen({ data: { orgId: currentOrgId, documentId: row.id } });
          const blob = new Blob([res.xml], { type: "application/xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${row.ref ?? "invoice"}.xml`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(`فاتورة إلكترونية ICV ${res.icv}`);
        } catch (e: any) {
          toast.error(e?.message ?? "فشل توليد الفاتورة الإلكترونية");
        } finally {
          setBusy(false);
        }
      }}
      className="p-1.5 hover:bg-blue-50 text-[#1b6ea8] rounded disabled:opacity-50"
      aria-label="فاتورة إلكترونية XML"
      title="توليد/تنزيل فاتورة ZATCA الإلكترونية (XML)"
    >
      <FileCode2 className="w-3.5 h-3.5" />
    </button>
  );
}
