// Preview pane for scanned invoice files.
// PDFs are rendered client-side with pdf.js into canvases (embedded PDF plugins are blocked
// inside sandboxed preview iframes and show a black/empty screen). Images render as <img>.
import { useEffect, useMemo, useRef, useState } from "react";

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const b64 = dataUrl.split(",")[1];
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function PdfCanvasViewer({ src, filename }: { src: string; filename?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let doc: any = null;

    (async () => {
      try {
        setError(null);
        setPages(0);
        const pdfjs: any = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        let source: any;
        if (src.startsWith("data:")) {
          const bytes = dataUrlToBytes(src);
          if (!bytes) throw new Error("bad data url");
          source = { data: bytes };
        } else {
          source = { url: src };
        }

        doc = await pdfjs.getDocument(source).promise;
        if (cancelled) return;
        setPages(doc.numPages);

        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = "";
        const width = Math.max(320, host.clientWidth - 24);

        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * Math.min(2, window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${width}px`;
          canvas.style.height = "auto";
          canvas.className = "shadow-sm rounded bg-white mx-auto";
          host.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        }
      } catch (e) {
        console.error("[pdf-preview]", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "تعذر عرض الملف");
      }
    })();

    return () => {
      cancelled = true;
      try {
        doc?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [src]);

  return (
    <div className="h-full overflow-auto bg-[#f7f6f0] p-3">
      {error ? (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-[#0f2a1d]/70">
          <span>تعذر عرض معاينة PDF داخل الصفحة.</span>
          <a href={src} target="_blank" rel="noreferrer" download={filename} className="underline">
            فتح الملف في تبويب جديد
          </a>
        </div>
      ) : pages === 0 ? (
        <div className="h-full flex items-center justify-center text-xs text-[#0f2a1d]/60">جارٍ تحضير معاينة PDF…</div>
      ) : null}
      <div ref={hostRef} className="flex flex-col gap-3" />
    </div>
  );
}

export function FilePreviewPane({
  src,
  mime,
  filename,
  className = "",
  minHeightClass = "min-h-[560px]",
}: {
  src: string;
  mime?: string;
  filename?: string;
  className?: string;
  minHeightClass?: string;
}) {
  const isPdf = useMemo(
    () => mime === "application/pdf" || src.startsWith("data:application/pdf") || /\.pdf($|\?)/i.test(filename || ""),
    [mime, src, filename],
  );
  const isImage = useMemo(
    () => (mime?.startsWith("image/") ?? false) || src.startsWith("data:image/"),
    [mime, src],
  );

  if (!src) return null;

  if (isPdf) {
    return (
      <div className={`w-full h-full ${minHeightClass} ${className}`}>
        <PdfCanvasViewer src={src} filename={filename} />
      </div>
    );
  }

  if (isImage) {
    return (
      <div className={`h-full overflow-auto bg-white flex items-center justify-center p-3 ${className}`}>
        <img src={src} alt={filename || ""} className="max-w-full h-auto shadow-sm rounded" />
      </div>
    );
  }

  return (
    <div className={`h-full ${minHeightClass} flex items-center justify-center ${className}`}>
      <a href={src} target="_blank" rel="noreferrer" download={filename} className="text-xs underline">
        فتح الملف في تبويب جديد
      </a>
    </div>
  );
}
