import jsQR from "jsqr";
import { selectZatcaQr, type QrReview } from "./zatca-qr";

/** All decoding stays on the user's device. Never follow URLs embedded in codes. */
export async function readInvoiceQr(source: string): Promise<QrReview> {
  const codes: string[] = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { status: "unreadable", warning: "تعذرت قراءة رمز الفاتورة على هذا الجهاز." };
  const decode = async () => {
    for (let i = 0; i < 8; i++) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
      if (!code) return;
      codes.push(code.data);
      const corners = [code.location.topLeftCorner, code.location.topRightCorner, code.location.bottomLeftCorner, code.location.bottomRightCorner];
      const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
      ctx.fillStyle = "white";
      ctx.fillRect(x - 2, y - 2, Math.max(...corners.map(p => p.x)) - x + 4, Math.max(...corners.map(p => p.y)) - y + 4);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error("توجد رموز كثيرة؛ ارفع الفاتورة في ملف منفصل.");
  };
  let pdf: { destroy(): Promise<void> } | undefined;
  try {
    if (source.startsWith("data:application/pdf")) {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      const document = await pdfjs.getDocument({ data: Uint8Array.from(atob(source.split(",")[1]), c => c.charCodeAt(0)) }).promise;
      pdf = document;
      if (document.numPages > 10) return { status: "unreadable", warning: "قراءة QR تدعم حتى 10 صفحات؛ ارفع كل فاتورة منفصلة للمطابقة." };
      for (let n = 1; n <= document.numPages; n++) {
        const page = await document.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(3, 2400 / Math.max(base.width, base.height)) });
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        await decode(); page.cleanup();
      }
    } else {
      const img = new Image(); img.src = source; await img.decode();
      const scale = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height); await decode();
    }
    return selectZatcaQr(codes);
  } catch {
    return { status: "unreadable", warning: "تعذرت قراءة رمز زاتكا؛ راجع البيانات أو ارفع صورة أوضح." };
  } finally { await pdf?.destroy(); canvas.width = canvas.height = 0; }
}
