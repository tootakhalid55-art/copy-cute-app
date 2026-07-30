import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntakeStatus =
  | "received" | "extracting" | "extracted" | "review"
  | "auto_drafted" | "posted" | "duplicate" | "rejected" | "failed";

const AUTO_POST_THRESHOLD = 0.9;
const REVIEW_THRESHOLD = 0.7;
const PRIMARY_MODEL = "google/gemini-2.5-flash";
const FALLBACK_MODEL = "google/gemini-2.5-pro";

// ---------- notification helper ----------
async function notify(supabase: any, orgId: string, kind: string, title: string, body: string, ref: string | null = null) {
  try {
    await supabase.from("notifications").insert({
      org_id: orgId,
      kind,
      title,
      body,
      reference: ref,
    });
  } catch { /* best effort */ }
}

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
        org_id: data.orgId, channel: "upload",
        source_ref: `upload:${Date.now()}:${userId}`,
        sender: data.sender, subject: data.subject || data.filename,
        status: "received",
        raw_payload: {
          filename: data.filename,
          size: data.fileDataUrl.length,
          fileDataUrl: data.fileDataUrl,
        },
      })
      .select("id").single();
    if (error) throw new Error(error.message);

    await supabase.from("ap_intake_events").insert({
      intake_id: intake.id, org_id: data.orgId, event_type: "received", actor_id: userId,
      payload: { channel: "upload", filename: data.filename },
    });
    await notify(supabase, data.orgId, "ap.received", "فاتورة جديدة",
      `تم استلام: ${data.filename}`, intake.id);

    return { intakeId: intake.id };
  });

// ---------- extraction (primary + fallback) ----------
async function callExtraction(model: string, fileDataUrl: string, filename: string, hints: string) {
  const { callLovableAI } = await import("@/lib/ai-gateway.server");
  const isPdf = fileDataUrl.startsWith("data:application/pdf");
  const content: any = [
    { type: "text", text: `Extract this supplier invoice as strict JSON.${hints ? `\nHints from previous invoices of this supplier:\n${hints}` : ""}` },
    isPdf ? { type: "file", file: { filename, file_data: fileDataUrl } }
          : { type: "image_url", image_url: { url: fileDataUrl } },
  ];
  const raw = await callLovableAI({
    model, response_format: { type: "json_object" }, temperature: 0.1,
    messages: [
      { role: "system", content: "Return JSON with keys: supplierName, supplierNameAr, supplierVatNumber, invoiceNumber, invoiceDate (YYYY-MM-DD), dueDate, currency, subtotal, vat, grandTotal, lines[{description, qty, price, lineTotal, tax}], confidence{supplierName, invoiceNumber, invoiceDate, grandTotal, vat, lines}, ocr_boxes[{field,key,text,page,left,top,width,height,units}]. Confidence values are 0..100. Support Arabic and English. If a field is unknown, use null and confidence 0. For ocr_boxes, return best-effort coordinates as percentages (units=percent) or pixels." },
      { role: "user", content },
    ],
  });
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

function normalizeFieldKey(key: string) {
  return key.replace(/\[(\d+)\]/g, ".$1").replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase();
}

async function loadLayoutHints(supabase: any, orgId: string, partyId: string | null): Promise<string> {
  if (!partyId) return "";
  const { data } = await supabase
    .from("ap_supplier_layouts")
    .select("hints, sample_count")
    .eq("org_id", orgId).eq("party_id", partyId).maybeSingle();
  if (!data || !data.hints || data.sample_count < 3) return "";
  return JSON.stringify(data.hints).slice(0, 1500);
}

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

    const { data: intake, error: fetchErr } = await supabase
      .from("ap_intake_documents")
      .select("id, org_id, status")
      .eq("id", data.intakeId).single();
    if (fetchErr || !intake) throw new Error("Intake not found");

    await supabase
      .from("ap_intake_documents")
      .update({ status: "extracting", extraction_started_at: new Date().toISOString() })
      .eq("id", intake.id);
    await supabase.from("ap_intake_events").insert({
      intake_id: intake.id, org_id: intake.org_id, event_type: "extraction_started", actor_id: userId,
    });

    try {
      const { matchSupplier, findDuplicateIntake } = await import("./matcher.server");

      // Primary extraction (no supplier known yet, so no hints)
      let extraction: any;
      let usedModel = PRIMARY_MODEL;
      let fallbackUsed = false;
      try {
        extraction = await callExtraction(PRIMARY_MODEL, data.fileDataUrl, data.filename, "");
      } catch (e) {
        // JSON parse or provider failure → fallback
        fallbackUsed = true;
        usedModel = FALLBACK_MODEL;
        extraction = await callExtraction(FALLBACK_MODEL, data.fileDataUrl, data.filename, "");
      }

      const confs = extraction.confidence && typeof extraction.confidence === "object"
        ? Object.values(extraction.confidence as Record<string, number>).map(Number).filter(Number.isFinite)
        : [];
      let avg100 = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 60;
      let confidence = Math.max(0, Math.min(1, avg100 / 100));

      // If primary confidence too low and we didn't already fallback, retry with pro + hints
      const { best: preMatch } = await matchSupplier(supabase, intake.org_id, {
        supplierName: extraction.supplierName, vat: extraction.supplierVatNumber,
      });

      if (confidence < REVIEW_THRESHOLD && !fallbackUsed) {
        const hints = await loadLayoutHints(supabase, intake.org_id, preMatch?.party_id ?? null);
        try {
          const retry = await callExtraction(FALLBACK_MODEL, data.fileDataUrl, data.filename, hints);
          const rConfs = retry.confidence && typeof retry.confidence === "object"
            ? Object.values(retry.confidence as Record<string, number>).map(Number).filter(Number.isFinite) : [];
          const rAvg = rConfs.length ? rConfs.reduce((a, b) => a + b, 0) / rConfs.length : avg100;
          if (rAvg > avg100) {
            extraction = retry; avg100 = rAvg;
            confidence = Math.max(0, Math.min(1, avg100 / 100));
            usedModel = FALLBACK_MODEL; fallbackUsed = true;
          }
        } catch { /* keep primary */ }
      }

      const { best, all } = await matchSupplier(supabase, intake.org_id, {
        supplierName: extraction.supplierName, vat: extraction.supplierVatNumber,
      });
      const dup = await findDuplicateIntake(
        supabase, intake.org_id, best?.party_id ?? null,
        extraction.invoiceNumber, Number(extraction.grandTotal) || 0,
      );

      const nextStatus: IntakeStatus = dup ? "duplicate"
        : confidence >= AUTO_POST_THRESHOLD && best && best.score >= 0.9 ? "auto_drafted"
        : confidence >= REVIEW_THRESHOLD ? "review" : "extracted";

      // Best-effort OCR anchor hints for the review UI.
      // These are text references, not pixel boxes, unless a future OCR engine supplies coordinates.
      const anchors = [
        ["supplierName", extraction.supplierName],
        ["supplierVatNumber", extraction.supplierVatNumber],
        ["invoiceNumber", extraction.invoiceNumber],
        ["invoiceDate", extraction.invoiceDate],
        ["dueDate", extraction.dueDate],
        ["currency", extraction.currency],
        ["subtotal", extraction.subtotal],
        ["vat", extraction.vat],
        ["grandTotal", extraction.grandTotal],
      ].filter(([, v]) => v != null && String(v).trim() !== "").map(([field, value]) => ({
        field,
        text: String(value),
        key: normalizeFieldKey(String(field)),
      }));
      const ocrBoxes = Array.isArray((extraction as any).ocr_boxes)
        ? (extraction as any).ocr_boxes.map((b: any) => ({
            field: String(b.field || b.key || "").trim(),
            key: normalizeFieldKey(String(b.key || b.field || "")),
            text: String(b.text || ""),
            page: Number(b.page || 1),
            left: Number(b.left || b.x || 0),
            top: Number(b.top || b.y || 0),
            width: Number(b.width || b.w || 0),
            height: Number(b.height || b.h || 0),
            units: b.units === "px" ? "px" : "percent",
          }))
        : [];

      await supabase.from("ap_intake_documents").update({
        status: nextStatus, extraction,
        extraction_model: usedModel,
        extraction_completed_at: new Date().toISOString(),
        confidence, matched_party_id: best?.party_id ?? null,
        match_confidence: best?.score ?? null, matched_bill_id: dup,
        raw_payload: {
          ...(intake as any).raw_payload || {},
          ocr_anchors: anchors,
          ocr_boxes: ocrBoxes,
        },
      }).eq("id", intake.id);

      await supabase.from("ap_intake_events").insert({
        intake_id: intake.id, org_id: intake.org_id,
        event_type: dup ? "duplicate_detected" : "extracted", actor_id: userId,
        payload: { confidence, model: usedModel, fallbackUsed, candidates: all, matched_bill_id: dup },
      });

      // Notifications by outcome
      const supplier = extraction.supplierName || "مورد غير محدد";
      if (dup) {
        await notify(supabase, intake.org_id, "ap.duplicate", "فاتورة مكررة",
          `${supplier} — رقم ${extraction.invoiceNumber || "?"}`, intake.id);
      } else if (nextStatus === "auto_drafted") {
        await notify(supabase, intake.org_id, "ap.auto_drafted", "مسودة تلقائية",
          `${supplier} — ${Number(extraction.grandTotal || 0).toLocaleString()}`, intake.id);
      } else if (nextStatus === "review") {
        await notify(supabase, intake.org_id, "ap.needs_review", "بحاجة لمراجعة",
          `${supplier} — الثقة ${Math.round(confidence * 100)}%`, intake.id);
      }

      return { intakeId: intake.id, status: nextStatus, confidence, matchedPartyId: best?.party_id ?? null, duplicateOf: dup };
    } catch (e: any) {
      const message = e?.message || "Extraction failed";
      await supabase.from("ap_intake_documents")
        .update({ status: "failed", error_message: message }).eq("id", intake.id);
      await supabase.from("ap_intake_events").insert({
        intake_id: intake.id, org_id: intake.org_id, event_type: "failed", actor_id: userId,
        payload: { error: message },
      });
      await notify(supabase, intake.org_id, "ap.failed", "فشل استخراج الفاتورة", message, intake.id);
      throw new Error(message);
    }
  });

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
      .from("ap_intake_documents").update({ assigned_to: data.userId })
      .eq("id", data.intakeId).select("org_id").single();
    if (error) throw new Error(error.message);
    await supabase.from("ap_intake_events").insert({
      intake_id: data.intakeId, org_id: row.org_id, event_type: "review_assigned",
      actor_id: userId, payload: { assigned_to: data.userId },
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
      .eq("id", data.intakeId).select("org_id").single();
    if (error) throw new Error(error.message);
    await supabase.from("ap_intake_events").insert({
      intake_id: data.intakeId, org_id: row.org_id, event_type: "rejected",
      actor_id: userId, payload: { reason: data.reason },
    });
    await notify(supabase, row.org_id, "ap.rejected", "فاتورة مرفوضة", data.reason || "", data.intakeId);
    return { ok: true };
  });

// ---------- createBillFromIntake ----------
export const createBillFromIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as {
      intakeId?: string;
      partyId?: string | null;
      newParty?: { name: string; name_ar?: string; vat_number?: string; email?: string; phone?: string } | null;
      overrides?: Record<string, any>;
      editedExtraction?: Record<string, any> | null;
    };
    if (!i?.intakeId) throw new Error("intakeId is required");
    return {
      intakeId: i.intakeId,
      partyId: i.partyId ?? null,
      newParty: i.newParty ?? null,
      overrides: i.overrides ?? {},
      editedExtraction: i.editedExtraction ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: intake, error: fErr } = await supabase
      .from("ap_intake_documents")
      .select("id, org_id, extraction, matched_party_id, status")
      .eq("id", data.intakeId).single();
    if (fErr || !intake) throw new Error("Intake not found");
    if (["posted", "rejected"].includes(intake.status)) throw new Error("Intake already finalized");

    const originalEx = (intake.extraction || {}) as any;
    const ex = data.editedExtraction ? { ...originalEx, ...data.editedExtraction } : originalEx;
    const o = data.overrides || {};

    // Resolve party (unchanged logic)
    let partyId = data.partyId ?? intake.matched_party_id ?? null;
    if (!partyId && data.newParty?.name) {
      const { data: created, error: pErr } = await supabase
        .from("parties")
        .insert({
          org_id: intake.org_id, type: "supplier" as any,
          name: data.newParty.name,
          name_en: data.newParty.name_ar || data.newParty.name,
          vat_number: data.newParty.vat_number || ex.supplierVatNumber || null,
          email: data.newParty.email || null, phone: data.newParty.phone || null,
        })
        .select("id").single();
      if (pErr) throw new Error(`Failed to create supplier: ${pErr.message}`);
      partyId = created.id;

      const aliases: any[] = [];
      const push = (t: string, v?: string | null) => {
        const val = (v || "").toString().trim();
        if (!val) return;
        aliases.push({
          org_id: intake.org_id, party_id: partyId, alias_type: t, alias_value: val,
          normalized: val.toLowerCase().replace(/\s+/g, " "), source: "auto_learned",
        });
      };
      push("name", data.newParty.name);
      push("vat", (data.newParty.vat_number || "").replace(/\D+/g, ""));
      push("email", data.newParty.email);
      push("phone", (data.newParty.phone || "").replace(/\D+/g, ""));
      if (aliases.length) await supabase.from("supplier_aliases")
        .upsert(aliases as any, { onConflict: "org_id,alias_type,normalized" });
    }
    if (!partyId) throw new Error("Supplier is required to create a bill");

    const issueDate = o.issue_date || ex.invoiceDate || new Date().toISOString().slice(0, 10);
    const dueDate = o.due_date || ex.dueDate || issueDate;
    const currency = (o.currency || ex.currency || "SAR").toUpperCase();
    const subtotal = Number(o.subtotal ?? ex.subtotal ?? 0);
    const tax = Number(o.vat ?? ex.vat ?? 0);
    const total = Number(o.grandTotal ?? ex.grandTotal ?? (subtotal + tax));
    const ref = o.ref || ex.invoiceNumber || `AP-${Date.now()}`;

    const { data: bill, error: bErr } = await supabase.from("documents").insert({
      org_id: intake.org_id, kind: "purchase_invoice" as any, party_id: partyId,
      doc_number: ref, issue_date: issueDate, due_date: dueDate, currency,
      subtotal, vat_total: tax, grand_total: total,
      status: "draft" as any,
      notes: o.notes || `Created from AP intake ${intake.id}`, created_by: userId,
    } as any).select("id").single();
    if (bErr) throw new Error(`Failed to create bill: ${bErr.message}`);

    const lines = Array.isArray(o.lines) ? o.lines : Array.isArray(ex.lines) ? ex.lines : [];
    if (lines.length) {
      const rows = lines.map((l: any, idx: number) => ({
        document_id: bill.id, position: idx + 1, description: l.description || "",
        qty: Number(l.qty) || 1, price: Number(l.price ?? l.unit_price) || 0,
        tax_rate: Number(l.tax) || 15, discount: Number(l.discount) || 0,
        line_total: Number(l.lineTotal ?? l.line_total) || (Number(l.qty || 1) * Number(l.price || 0)),
      }));
      const { error: lErr } = await supabase.from("document_lines").insert(rows as any);
      if (lErr) throw new Error(`Failed to add bill lines: ${lErr.message}`);
    }

    await supabase.from("ap_intake_documents").update({
      status: "posted", matched_bill_id: bill.id, matched_party_id: partyId,
    }).eq("id", intake.id);

    await supabase.from("ap_intake_events").insert({
      intake_id: intake.id, org_id: intake.org_id, event_type: "drafted",
      actor_id: userId, payload: { bill_id: bill.id, party_id: partyId },
    });

    // --- Learning: diff original extraction vs edited, persist corrections ---
    try {
      const { diffExtraction } = await import("./diff");
      const corrections = diffExtraction(originalEx, ex);
      if (corrections.length) {
        await supabase.from("ap_intake_corrections").insert(
          corrections.map((c) => ({
            org_id: intake.org_id, intake_id: intake.id, party_id: partyId,
            field_path: c.field_path, extracted_value: c.extracted ?? null,
            corrected_value: c.corrected ?? null, actor_id: userId,
          })) as any,
        );

        // Update supplier layout hints (aggregate corrected values per field)
        const { data: existing } = await supabase
          .from("ap_supplier_layouts")
          .select("hints, sample_count")
          .eq("org_id", intake.org_id).eq("party_id", partyId).maybeSingle();
        const hints: any = existing?.hints || {};
        for (const c of corrections) {
          hints[c.field_path] = hints[c.field_path] || [];
          if (hints[c.field_path].length < 5)
            hints[c.field_path].push(String(c.corrected).slice(0, 120));
        }
        await supabase.from("ap_supplier_layouts").upsert({
          org_id: intake.org_id, party_id: partyId, hints,
          sample_count: (existing?.sample_count || 0) + 1,
          last_seen_at: new Date().toISOString(),
        } as any, { onConflict: "org_id,party_id" });
      }
    } catch { /* learning is best-effort */ }

    await notify(supabase, intake.org_id, "ap.approved", "تم إنشاء مسودة فاتورة",
      `${ex.supplierName || ""} — ${total.toLocaleString()} ${currency}`, bill.id);

    return { billId: bill.id, partyId };
  });
