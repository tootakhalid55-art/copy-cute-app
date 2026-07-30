// Background AP intake processor. pg_cron POSTs here every minute.
// Picks queued jobs (SKIP LOCKED via ap_intake_queue_pick), runs extraction,
// validation, PO/GRN match, and moves to done/failed/dead with retry backoff.
import { createFileRoute } from "@tanstack/react-router";

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000]; // 30s, 2m, 10m, 1h, 6h

export const Route = createFileRoute("/api/public/hooks/ap-intake-process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apiKey || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }
        const admin = await adminClient();
        const url = new URL(request.url);
        const batch = Math.min(10, Math.max(1, Number(url.searchParams.get("batch")) || 3));

        const { data: jobs, error } = await admin.rpc("ap_intake_queue_pick", { _limit: batch });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        const results: any[] = [];
        for (const job of (jobs || []) as any[]) {
          const started = Date.now();
          try {
            const { data: intake } = await admin
              .from("ap_intake_documents")
              .select("id, org_id, status, matched_party_id")
              .eq("id", job.intake_id)
              .single();
            if (!intake) throw new Error("intake row missing");

            // Extraction
            await admin
              .from("ap_intake_documents")
              .update({ status: "extracting", extraction_started_at: new Date().toISOString() })
              .eq("id", intake.id);

            const { callLovableAI } = await import("@/lib/ai-gateway.server");
            const fileDataUrl: string = job.payload?.fileDataUrl;
            const filename: string = job.payload?.filename || "invoice";
            const isPdf = fileDataUrl?.startsWith("data:application/pdf");
            const content: any = [
              {
                type: "text",
                text:
                  "You are extracting a Saudi-Arabia supplier invoice. Support Arabic + English. " +
                  "For multi-page PDFs, aggregate all pages. Return STRICT JSON only with keys: " +
                  "supplierName, supplierNameAr, supplierVatNumber, supplierAddress, invoiceNumber, invoiceDate, dueDate, " +
                  "currency (ISO), subtotal, vat, grandTotal, poNumber, lines[] (each: description, descriptionAr, qty, price, discount, tax, lineTotal), " +
                  "confidence{} (each field 0-100), ocr_boxes[] (field,key,text,page,left,top,width,height,units). Compute lineTotal = qty*price - discount if missing. " +
                  "For ocr_boxes, return best-effort coordinates as percentages (units=percent) or pixels.",
              },
              isPdf
                ? { type: "file", file: { filename, file_data: fileDataUrl } }
                : { type: "image_url", image_url: { url: fileDataUrl } },
            ];
            const raw = await callLovableAI({
              model: "google/gemini-3.6-flash",
              response_format: { type: "json_object" },
              temperature: 0.1,
              messages: [
                { role: "system", content: "Return JSON only." },
                { role: "user", content },
              ],
            });
            const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
            let extraction: any = {};
            try { extraction = JSON.parse(cleaned); } catch { extraction = {}; }
            const ocrBoxes = Array.isArray(extraction.ocr_boxes)
              ? extraction.ocr_boxes.map((b: any) => ({
                  field: String(b.field || b.key || "").trim(),
                  key: String(b.key || b.field || "").trim(),
                  text: String(b.text || ""),
                  page: Number(b.page || 1),
                  left: Number(b.left || b.x || 0),
                  top: Number(b.top || b.y || 0),
                  width: Number(b.width || b.w || 0),
                  height: Number(b.height || b.h || 0),
                  units: b.units === "px" ? "px" : "percent",
                }))
              : [];

            // Matcher + duplicate
            const { matchSupplier, findDuplicateIntake } = await import("@/lib/ap/matcher.server");
            const { best } = await matchSupplier(admin, intake.org_id, {
              supplierName: extraction.supplierName,
              vat: extraction.supplierVatNumber,
            });
            const dup = await findDuplicateIntake(
              admin, intake.org_id, best?.party_id ?? null,
              extraction.invoiceNumber, Number(extraction.grandTotal) || 0,
            );

            // Validation + PO/GRN
            const { validateExtraction, matchPurchaseOrderAndGrn } = await import("@/lib/ap/validation.server");
            const validation = validateExtraction(extraction);
            const { poId, grnId } = await matchPurchaseOrderAndGrn(
              admin, intake.org_id, best?.party_id ?? null,
              Number(extraction.grandTotal) || 0, extraction.invoiceDate || null,
            );

            // Confidence
            const confs = extraction.confidence && typeof extraction.confidence === "object"
              ? Object.values(extraction.confidence as Record<string, number>).map(Number).filter(Number.isFinite)
              : [];
            const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 60;
            const confidence = Math.max(0, Math.min(1, avg / 100));

            const nextStatus =
              dup ? "duplicate"
              : !validation.ok ? "review"
              : confidence >= 0.9 && best && best.score >= 0.9 ? "auto_drafted"
              : confidence >= 0.7 ? "review"
              : "extracted";

            const elapsed = Date.now() - started;
            await admin
              .from("ap_intake_documents")
              .update({
                status: nextStatus,
                extraction,
                extraction_model: "google/gemini-3.6-flash",
                extraction_completed_at: new Date().toISOString(),
                confidence,
                matched_party_id: best?.party_id ?? null,
                match_confidence: best?.score ?? null,
                matched_bill_id: dup,
                validation: validation as any,
                po_document_id: poId,
                grn_document_id: grnId,
                processing_time_ms: elapsed,
                ocr_language: extraction.supplierNameAr ? "ar+en" : "en",
                ocr_json: {
                  ...extraction,
                  ocr_boxes: ocrBoxes,
                },
              })
              .eq("id", intake.id);

            await admin.from("ap_intake_events").insert({
              intake_id: intake.id, org_id: intake.org_id,
              event_type: dup ? "duplicate_detected" : "extracted",
              payload: { confidence, matched_party_id: best?.party_id, po_id: poId, grn_id: grnId, validation_ok: validation.ok },
            });

            await admin
              .from("ap_intake_queue")
              .update({ status: "done", last_error: null })
              .eq("id", job.id);

            results.push({ id: job.id, status: "done", intake: intake.id, elapsed });
          } catch (e: any) {
            const msg = e?.message || String(e);
            const attempts = (job.attempts || 0);
            const dead = attempts >= (job.max_attempts || 5);
            const backoff = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] || 3600000;
            await admin
              .from("ap_intake_queue")
              .update({
                status: dead ? "dead" : "failed",
                last_error: msg.slice(0, 500),
                next_run_at: new Date(Date.now() + backoff).toISOString(),
              })
              .eq("id", job.id);

            if (dead) {
              await admin
                .from("ap_intake_documents")
                .update({ status: "failed", error_message: msg.slice(0, 500) })
                .eq("id", job.intake_id);
              await admin.from("ap_intake_events").insert({
                intake_id: job.intake_id, org_id: job.org_id,
                event_type: "failed", payload: { error: msg, dead: true },
              });
            }
            results.push({ id: job.id, status: dead ? "dead" : "failed", error: msg });
          }
        }

        return new Response(JSON.stringify({ ok: true, processed: results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
