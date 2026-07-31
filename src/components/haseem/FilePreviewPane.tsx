// Preview pane for scanned invoice files: PDFs render in an iframe via a blob URL
// (data: URLs are blocked from framing in Chrome and show a black screen), images render as <img>.
import { useEffect, useMemo, useState } from "react";

function dataUrlToBlobUrl(dataUrl: string): string | null {
  try {
    const [head, b64] = dataUrl.split(",");
    if (!head || !b64) return null;
    const mime = head.match(/data:([^;]+)/)?.[1] || "application/pdf";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return null;
  }
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

  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isPdf || !src.startsWith("data:")) {
      setBlobUrl(null);
      return;
    }
    const url = dataUrlToBlobUrl(src);
    setBlobUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, isPdf]);

  if (!src) return null;

  if (isPdf) {
    const pdfSrc = blobUrl ?? (src.startsWith("data:") ? null : src);
    if (!pdfSrc) {
      return (
        <div className={`w-full h-full ${minHeightClass} flex items-center justify-center text-xs text-[#0f2a1d]/60 ${className}`}>
          جارٍ تحضير معاينة PDF…
        </div>
      );
    }
    return (
      <object data={pdfSrc} type="application/pdf" className={`w-full h-full ${minHeightClass} bg-white ${className}`}>
        <iframe src={pdfSrc} title={filename || "pdf"} className={`w-full h-full ${minHeightClass} bg-white`} />
      </object>
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
