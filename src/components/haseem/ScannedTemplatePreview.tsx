import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { renderScannedLayout, type ScannedLayout } from "@/lib/haseem/scanned-layout";
import type { PrintDocData } from "@/lib/haseem/printDoc";
import { scanPreviewData } from "@/lib/haseem/scan-preview-data";

export function ScannedTemplatePreview({ layout, data }: { layout: ScannedLayout; data?: PrintDocData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [qr, setQr] = useState<{ payload: string; url: string } | null>(null);
  const payload = data?.sourceQrPayload;
  useEffect(() => {
    let alive = true;
    setQr(null);
    if (payload) void QRCode.toDataURL(payload, { margin: 4, width: 360, errorCorrectionLevel: "M" })
      .then(url => { if (alive) setQr({ payload, url }); }).catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [payload]);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, width / (layout.pageWidthMm * 96 / 25.4));
  const html = renderScannedLayout(layout, { ...(data ?? scanPreviewData()), qrDataUrl: data?.qrDataUrl ?? (qr?.payload === payload ? qr?.url : undefined) });
  return <div ref={ref} className="w-full bg-white border rounded overflow-hidden">
    <iframe title="معاينة القالب المستخرج" sandbox="" className="w-full border-0" style={{ height: Math.max(280, layout.pageHeightMm * 96 / 25.4 * scale) }}
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}*{box-sizing:border-box}.doc{zoom:${scale}}</style></head><body>${html}</body></html>`} />
  </div>;
}
