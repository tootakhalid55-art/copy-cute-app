// Public document-verification endpoint. The QR on printed documents points
// at /verify?r=<doc_number>&t=<verify_token>; that page calls this endpoint,
// which works from ANY device (the token stored in documents.meta is the
// capability — no auth, and only non-sensitive summary fields are returned).
import { createFileRoute } from "@tanstack/react-router";

const KIND_AR: Record<string, string> = {
  sales_quotation: "عرض سعر",
  sales_invoice: "فاتورة ضريبية",
  simplified_tax_invoice: "فاتورة ضريبية مبسطة",
  standard_tax_invoice: "فاتورة ضريبية",
  credit_note: "إشعار دائن",
  debit_note: "إشعار مدين",
  purchase_order: "أمر شراء",
  purchase_invoice: "فاتورة مشتريات",
  receipt_voucher: "سند قبض",
  payment_voucher: "سند صرف",
};

export const Route = createFileRoute("/api/public/verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ref = (url.searchParams.get("r") ?? "").trim();
        const token = (url.searchParams.get("t") ?? "").trim();
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });

        if (!ref || token.length < 16) return json({ ok: false, reason: "bad_request" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("documents")
          .select("kind, doc_number, issue_date, due_date, currency, subtotal, vat_total, grand_total, status, party_snapshot, organizations(name, settings)")
          .eq("doc_number", ref)
          .eq("meta->>verify_token", token)
          .limit(1)
          .maybeSingle();

        if (error) return json({ ok: false, reason: "server_error" }, 500);
        if (!data) return json({ ok: false, reason: "not_found" }, 404);

        const d = data as any;
        return json({
          ok: true,
          kind: d.kind,
          kind_ar: KIND_AR[d.kind] ?? d.kind,
          doc_number: d.doc_number,
          issue_date: d.issue_date,
          due_date: d.due_date,
          currency: d.currency,
          subtotal: Number(d.subtotal ?? 0),
          vat_total: Number(d.vat_total ?? 0),
          grand_total: Number(d.grand_total ?? 0),
          status: d.status,
          party_name: d.party_snapshot?.name ?? null,
          org_name: d.organizations?.name ?? null,
          org_vat: d.organizations?.settings?.zatca?.vatNumber ?? null,
        });
      },
    },
  },
});
