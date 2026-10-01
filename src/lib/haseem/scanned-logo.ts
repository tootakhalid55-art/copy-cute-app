import type { ScannedLayout } from "./scanned-layout";

/** Crop only the observed supplier logo, never the invoice or its variable data. */
export async function captureScannedLogo(source: string, layout: ScannedLayout): Promise<ScannedLayout> {
  const crop = layout.logoCrop;
  if (!crop) return layout;
  let pdf: { destroy: () => Promise<void> } | undefined;
  try {
    let image: CanvasImageSource, width: number, height: number;
    if (source.startsWith("data:application/pdf")) {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      const binary = atob(source.split(",")[1]);
      const document = await pdfjs.getDocument({ data: Uint8Array.from(binary, c => c.charCodeAt(0)) }).promise;
      pdf = document;
      if (crop.page > document.numPages) throw new Error("صفحة الشعار غير موجودة");
      const page = await document.getPage(crop.page);
      const viewport = page.getViewport({ scale: Math.min(2, 1800 / page.getViewport({ scale: 1 }).width) });
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("تعذر قراءة الشعار");
      await page.render({ canvasContext: ctx, viewport }).promise;
      image = canvas; width = canvas.width; height = canvas.height;
    } else {
      const img = new Image(); img.src = source;
      await img.decode(); image = img; width = img.naturalWidth; height = img.naturalHeight;
    }
    const sw = width * crop.width / 100, sh = height * crop.height / 100;
    const canvas = document.createElement("canvas"), scale = Math.min(1, 600 / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذر قراءة الشعار");
    ctx.drawImage(image, width * crop.x / 100, height * crop.y / 100, sw, sh, 0, 0, canvas.width, canvas.height);
    const logoDataUrl = canvas.toDataURL("image/png");
    if (logoDataUrl.length >= 400_000) throw new Error("صورة الشعار كبيرة؛ أعد المسح بصورة أوضح");
    return { ...layout, logoDataUrl };
  } finally { await pdf?.destroy(); }
}
