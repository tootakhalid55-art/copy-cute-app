// ZATCA Phase-2 server functions: seller config (stored on
// organizations.settings.zatca), e-invoice XML generation with the
// ICV/PIH chain, and the registered-invoice listing.
import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildZatcaXml, buildZatcaQr, type ZatcaSellerConfig } from "./ubl";

const DEFAULT_CONFIG: ZatcaSellerConfig = {
  sellerName: "",
  vatNumber: "",
  invoiceType: "simplified",
  countryCode: "SA",
};

export const getZatcaConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string };
    if (!i?.orgId) throw new Error("orgId is required");
    return { orgId: i.orgId };
  })
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organizations")
      .select("name, settings")
      .eq("id", data.orgId)
      .single();
    if (error) throw new Error(error.message);
    const cfg = { ...DEFAULT_CONFIG, ...((org as any)?.settings?.zatca ?? {}) } as ZatcaSellerConfig;
    if (!cfg.sellerName) cfg.sellerName = (org as any)?.name ?? "";
    return cfg;
  });

export const updateZatcaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string; config?: Partial<ZatcaSellerConfig> };
    if (!i?.orgId || !i.config) throw new Error("orgId and config are required");
    const vat = String(i.config.vatNumber ?? "").trim();
    if (vat && !/^3\d{13}3$/.test(vat)) {
      throw new Error("الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بـ 3");
    }
    return { orgId: i.orgId, config: i.config };
  })
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organizations")
      .select("settings")
      .eq("id", data.orgId)
      .single();
    if (error) throw new Error(error.message);
    const settings = { ...((org as any)?.settings ?? {}), zatca: { ...((org as any)?.settings?.zatca ?? {}), ...data.config } };
    const { error: upErr } = await (context.supabase.from("organizations") as any)
      .update({ settings })
      .eq("id", data.orgId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const generateZatcaInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string; documentId?: string };
    if (!i?.orgId || !i.documentId) throw new Error("orgId and documentId are required");
    return { orgId: i.orgId, documentId: i.documentId };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // Already generated? Return the stored XML.
    const { data: existing } = await sb
      .from("zatca_invoices")
      .select("xml, qr, icv, invoice_hash, status")
      .eq("org_id", data.orgId)
      .eq("document_id", data.documentId)
      .maybeSingle();
    if ((existing as any)?.xml) return existing;

    const [{ data: org, error: orgErr }, { data: doc, error: docErr }] = await Promise.all([
      sb.from("organizations").select("name, settings").eq("id", data.orgId).single(),
      sb
        .from("documents")
        .select("*, document_lines(*)")
        .eq("org_id", data.orgId)
        .eq("id", data.documentId)
        .single(),
    ]);
    if (orgErr) throw new Error(orgErr.message);
    if (docErr) throw new Error(docErr.message);

    const cfg = { ...DEFAULT_CONFIG, ...((org as any)?.settings?.zatca ?? {}) } as ZatcaSellerConfig;
    if (!cfg.sellerName) cfg.sellerName = (org as any)?.name ?? "";
    if (!cfg.vatNumber) throw new Error("أكمل إعدادات الفوترة الإلكترونية أولاً (الرقم الضريبي)");

    // Reserve ICV/PIH atomically.
    const { data: chain, error: chainErr } = await sb.rpc("zatca_next_chain", {
      _org: data.orgId,
      _doc_id: data.documentId,
    } as never);
    if (chainErr) throw new Error(chainErr.message);
    const { icv, pih, uuid } = chain as unknown as { icv: number; pih: string; uuid: string };

    const d = doc as any;
    const lines = (d.document_lines ?? [])
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((l: any) => ({
        description: l.description ?? "",
        qty: Number(l.qty ?? 1),
        price: Number(l.price ?? 0),
        discount: Number(l.discount ?? 0),
        taxRate: Number(l.tax_rate ?? 15),
      }));

    const input = {
      id: d.id,
      uuid,
      icv: Number(icv),
      pih,
      docNumber: d.doc_number,
      issueDate: d.issue_date,
      issueTime: (d.posted_at ?? d.created_at ?? "").slice(11, 19) || "00:00:00",
      kind: String(d.kind),
      currency: d.currency ?? "SAR",
      buyerName: d.party_snapshot?.name,
      buyerVat: d.party_snapshot?.vat_number,
      subtotal: Number(d.subtotal ?? 0),
      vatTotal: Number(d.vat_total ?? 0),
      grandTotal: Number(d.grand_total ?? 0),
      lines,
    };

    const xml = buildZatcaXml(cfg, input);
    // Invoice hash over the unsigned XML. The XAdES-signed canonical hash
    // is produced once the CSID certificates are configured.
    const hash = createHash("sha256").update(xml, "utf8").digest("base64");
    const qr = buildZatcaQr(cfg, input, hash);

    const { error: attachErr } = await sb.rpc("zatca_attach_xml", {
      _org: data.orgId,
      _doc_id: data.documentId,
      _xml: xml,
      _hash: hash,
      _qr: qr,
    } as never);
    if (attachErr) throw new Error(attachErr.message);

    return { xml, qr, icv, invoice_hash: hash, status: "generated" };
  });

export const listZatcaInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string };
    if (!i?.orgId) throw new Error("orgId is required");
    return { orgId: i.orgId };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("zatca_invoices")
      .select("id, document_id, icv, uuid, invoice_hash, status, environment, created_at, documents(doc_number, grand_total, issue_date)")
      .eq("org_id", data.orgId)
      .order("icv", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
