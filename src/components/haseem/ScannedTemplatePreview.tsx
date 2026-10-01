import { useEffect, useRef, useState } from "react";
import { renderScannedLayout, type ScannedLayout } from "@/lib/haseem/scanned-layout";
import type { PrintDocData } from "@/lib/haseem/printDoc";
import { scanPreviewData } from "@/lib/haseem/scan-preview-data";

export function ScannedTemplatePreview({ layout, data }: { layout: ScannedLayout; data?: PrintDocData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, width / (layout.pageWidthMm * 96 / 25.4));
  const html = renderScannedLayout(layout, data ?? scanPreviewData());
  return <div ref={ref} className="w-full bg-white border rounded overflow-hidden">
    <iframe title="معاينة القالب المستخرج" sandbox="" className="w-full border-0" style={{ height: Math.max(280, layout.pageHeightMm * 96 / 25.4 * scale) }}
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}*{box-sizing:border-box}.doc{zoom:${scale}}</style></head><body>${html}</body></html>`} />
  </div>;
}
