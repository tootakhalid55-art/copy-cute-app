import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Extraction reuses the existing scan pipeline; we import lazily inside handlers
// so the server-only AI helper never leaks into the client bundle.

export type IntakeStatus =
  | "received" | "extracting" | "extracted" | "review"
  | "auto_drafted" | "posted" | "duplicate" | "rejected" | "failed";

const AUTO_POST_THRESHOLD = 0.9;
const REVIEW_THRESHOLD = 0.7;

// ---------- createIntakeFromUpload ----------
export const createIntakeFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { orgId?: string; filename?: string; fileDataUrl?: string; subject?: string; sender?: string };
    if (!i?.orgId) throw new Error("orgId is required");
    if (!i?.fileDataUrl) throw new Error("fileDataUrl is required");
    if (i.fileDataUrl.length > 12 * 1024 * 1024) throw new Error("File too large (max 8MB)");
    return {
      orgId: i.orgId,
      filename: i.filename || "invoice",
      fileDataUrl: i.fileDataUrl,
      subject: i.subject || null,
      sender: i.sender || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: intake, error } = await supabase
      .from("ap_intake_documents")
      .insert({
        org_id: data.orgId,
        channel: "upload",
        source_ref: `upload:${Date.now()}:${userId}`,
        sender: data.sender,
        subject: data.subject || data.filename,
        status: "received",
        raw_payload: { filename: data.filename, size: data.fileDataUrl.length },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("ap_intake_events").insert({
      intake_id: intake.id,
      org_id: data.orgId,
      event_type: "received",
      actor_id: userId,
      payload: { channel: "upload", filename: data.filename },
    });

    return { intakeId: intake.id };
  });

// ---------- runIntakeExtraction ----------
export const runIntakeExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { intakeId?: string; fileDataUrl?: string; filename?: string };
    if (!i?.intakeId) throw new Error("intakeId is required");
    if (!i?.fileDataUrl) throw new Error("fileDataUrl is required");
    return { intakeId: i.intakeId, fileDataUrl: i.fileDataUrl, filename: i.filename || "invoice" };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load intake row (RLS enforces org membership)
    const { data: intake, error: fetchErr } = await supabase
      .from("ap_intake_documents")
      .select("id, org_id, status")
      .eq("id", data.intakeId)
      .single();
    if (fetchErr || !intake) throw new Error("Intake not found");

    await supabase
      .from("ap_intake_documents")
      .update({ status: "extracting", extraction_started_at: new Date().toISOString() })
      .eq("id", intake.id);

    await supabase.from("ap_intake_events").insert({
      intake_id: intake.id, org_id: intake.org_id, event_type: "extraction_started", actor_id: userId,
    });

    try {
      // Lazy imports keep server-only deps out of the client graph
      const [{ scanInvoice }, { matchSupplier, findDuplicateIntake }] = await Promise.all([
        import("@/lib/haseem/scan.functions"),
        import("./matcher.server"),
      ]);

      const extraction = await (scanInvoice as any).__executeServer
        ? await (scanInvoice as any).__executeServer({ data: { fileDataUrl: data.fileDataUrl, filename: data.filename } })
        : await runExtractionInline(data.fileDataUrl, data.filename);

      // Aggregate confidence: average of top-level fields (already 0..100)
      const confs = extraction.confidence && typeof extraction.confidence === "object"
        ? Object.values(extraction.confidence as Record<string, number>).map(Number).filter(Number.isFinite)
        : [];
      const avg100 = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 60;
      const confidence = Math.max(0, Math.min(1, avg100 / 100));

      // Supplier match
      const { best, all } = await matchSupplier(supabase, intake.org_id, {
        supplierName: extraction.supplierName,
        vat: extraction.supplierVatNumber,
      });

      // Duplicate check against existing bills
      const dup = await findDuplicateIntake(
        supabase,
        intake.org_id,
        best?.party_id ?? null,
        extraction.invoiceNumber,
        Number(extraction.grandTotal) || 0,
      );

      const nextStatus: IntakeStatus = dup
        ? "duplicate"
        : confidence >= AUTO_POST_THRESHOLD && best && best.score >= 0.9
          ? "auto_drafted"
          : confidence >= REVIEW_THRESHOLD
            ? "review"
            : "extracted";

      await supabase
        .from("ap_intake_documents")
        .update({
          status: nextStatus,
          extraction,
          extraction_model: "google/gemini-2.5-flash",
          extraction_completed_at: new Date().toISOString(),
          confidence,
          matched_party_id: best?.party_id ?? null,
          match_confidence: best?.score ?? null,
          matched_bill_id: dup,
        })
        .eq("id", intake.id);

      await supabase.from("ap_intake_events").insert({
        intake_id: intake.id,
        org_id: intake.org_id,
        event_type: dup ? "duplicate_detected" : "extracted",
        actor_id: userId,
        payload: { confidence, candidates: all, matched_bill_id: dup },
      });

      return { intakeId: intake.id, status: nextStatus, confidence, matchedPartyId: best?.party_id ?? null, duplicateOf: dup };
    } catch (e: any) {
      const message = e?.message || "Extraction failed";
      await supabase
        .from("ap_intake_documents")
        .update({ status: "failed", error_message: message })
        .eq("id", intake.id);
      await supabase.from("ap_intake_events").insert({
        intake_id: intake.id, org_id: intake.org_id, event_type: "failed", actor_id: userId,
        payload: { error: message },
      });
      throw new Error(message);
    }
  });

// Fallback: call the AI gateway directly if scanInvoice's private executor is unavailable.
async function runExtractionInline(fileDataUrl: string, filename: string) {
  const { callLovableAI } = await import("@/lib/ai-gateway.server");
  const isPdf = fileDataUrl.startsWith("data:application/pdf");
  const content: any = [
    { type: "text", text: "Extract the supplier invoice as strict JSON only." },
    isPdf
      ? { type: "file", file: { filename, file_data: fileDataUrl } }
      : { type: "image_url", image_url: { url: fileDataUrl } },
  ];
  const raw = await callLovableAI({
    model: "google/gemini-2.5-flash",
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      { role: "system", content: "Return JSON with keys: supplierName, supplierVatNumber, invoiceNumber, invoiceDate, dueDate, currency, subtotal, vat, grandTotal, lines[], confidence{}." },
      { role: "user", content },
    ],
  });
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { return { supplierName: "", supplierVatNumber: "", invoiceNumber: "", grandTotal: 0, lines: [], confidence: {} }; }
}

// ---------- assignReviewer ----------
export const assignIntakeReviewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { intakeId?: string; userId?: string | null };
    if (!i?.intakeId) throw new Error("intakeId is required");
    return { intakeId: i.intakeId, userId: i.userId || null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ap_intake_documents")
      .update({ assigned_to: data.userId })
      .eq("id", data.intakeId)
      .select("org_id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("ap_intake_events").insert({
      intake_id: data.intakeId, org_id: row.org_id, event_type: "review_assigned", actor_id: userId,
      payload: { assigned_to: data.userId },
    });
    return { ok: true };
  });

// ---------- rejectIntake ----------
export const rejectIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { intakeId?: string; reason?: string };
    if (!i?.intakeId) throw new Error("intakeId is required");
    return { intakeId: i.intakeId, reason: i.reason || "" };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ap_intake_documents")
      .update({ status: "rejected", error_message: data.reason || null })
      .eq("id", data.intakeId)
      .select("org_id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("ap_intake_events").insert({
      intake_id: data.intakeId, org_id: row.org_id, event_type: "rejected", actor_id: userId,
      payload: { reason: data.reason },
    });
    return { ok: true };
  });

// ---------- createBillFromIntake ----------
// Builds a draft bill in `documents` + `document_lines` from the intake extraction,
// creating the supplier if the reviewer supplied a new party payload.
export const createBillFromIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as {
      intakeId?: string;
      partyId?: string | null;
      newParty?: { name: string; name_ar?: string; vat_number?: string; email?: string; phone?: string } | null;
      overrides?: Record<string, any>;
    };
    if (!i?.intakeId) throw new Error("intakeId is required");
    return {
      intakeId: i.intakeId,
      partyId: i.partyId ?? null,
      newParty: i.newParty ?? null,
      overrides: i.overrides ?? {},
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: intake, error: fErr } = await supabase
      .from("ap_intake_documents")
      .select("id, org_id, extraction, matched_party_id, status")
      .eq("id", data.intakeId)
      .single();
    if (fErr || !intake) throw new Error("Intake not found");
    if (["posted", "rejected"].includes(intake.status)) throw new Error("Intake already finalized");

    const ex = (intake.extraction || {}) as any;
    const o = data.overrides || {};

    // Resolve party
    let partyId = data.partyId ?? intake.matched_party_id ?? null;
    if (!partyId && data.newParty?.name) {
      const { data: created, error: pErr } = await supabase
        .from("parties")
        .insert({
          org_id: intake.org_id,
          type: "supplier" as any,
          name: data.newParty.name,
          name_en: data.newParty.name_ar || data.newParty.name,
          vat_number: data.newParty.vat_number || ex.supplierVatNumber || null,
          email: data.newParty.email || null,
          phone: data.newParty.phone || null,
        })
        .select("id")
        .single();
      if (pErr) throw new Error(`Failed to create supplier: ${pErr.message}`);
      partyId = created.id;

      // Learn aliases
      const aliases: any[] = [];
      const push = (t: string, v?: string | null) => {
        const val = (v || "").toString().trim();
        if (!val) return;
        aliases.push({
          org_id: intake.org_id, party_id: partyId, alias_type: t,
          alias_value: val, normalized: val.toLowerCase().replace(/\s+/g, " "),
          source: "auto_learned",
        });
      };
      push("name", data.newParty.name);
      push("vat", (data.newParty.vat_number || "").replace(/\D+/g, ""));
      push("email", data.newParty.email);
      push("phone", (data.newParty.phone || "").replace(/\D+/g, ""));
      if (aliases.length) await supabase.from("supplier_aliases").upsert(aliases as any, { onConflict: "org_id,alias_type,normalized" });
    }
    if (!partyId) throw new Error("Supplier is required to create a bill");

    // Build bill payload
    const issueDate = o.issue_date || ex.invoiceDate || new Date().toISOString().slice(0, 10);
    const dueDate = o.due_date || ex.dueDate || issueDate;
    const currency = (o.currency || ex.currency || "SAR").toUpperCase();
    const subtotal = Number(o.subtotal ?? ex.subtotal ?? 0);
    const tax = Number(o.vat ?? ex.vat ?? 0);
    const total = Number(o.grandTotal ?? ex.grandTotal ?? (subtotal + tax));
    const ref = o.ref || ex.invoiceNumber || `AP-${Date.now()}`;

    const { data: bill, error: bErr } = await supabase
      .from("documents")
      .insert({
        org_id: intake.org_id,
        kind: "bill",
        party_id: partyId,
        ref,
        issue_date: issueDate,
        due_date: dueDate,
        currency,
        subtotal,
        tax,
        total,
        status: "draft",
        notes: o.notes || `Created from AP intake ${intake.id}`,
      })
      .select("id")
      .single();
    if (bErr) throw new Error(`Failed to create bill: ${bErr.message}`);

    // Lines
    const lines = Array.isArray(o.lines) ? o.lines : Array.isArray(ex.lines) ? ex.lines : [];
    if (lines.length) {
      const rows = lines.map((l: any, idx: number) => ({
        document_id: bill.id,
        line_no: idx + 1,
        description: l.description || "",
        qty: Number(l.qty) || 1,
        unit_price: Number(l.price ?? l.unit_price) || 0,
        tax_rate: Number(l.tax) || 15,
        discount: Number(l.discount) || 0,
        line_total: Number(l.lineTotal ?? l.line_total) || (Number(l.qty || 1) * Number(l.price || 0)),
      }));
      const { error: lErr } = await supabase.from("document_lines").insert(rows);
      if (lErr) throw new Error(`Failed to add bill lines: ${lErr.message}`);
    }

    await supabase
      .from("ap_intake_documents")
      .update({
        status: "posted",
        matched_bill_id: bill.id,
        matched_party_id: partyId,
      })
      .eq("id", intake.id);

    await supabase.from("ap_intake_events").insert({
      intake_id: intake.id, org_id: intake.org_id, event_type: "drafted", actor_id: userId,
      payload: { bill_id: bill.id, party_id: partyId },
    });

    return { billId: bill.id, partyId };
  });
