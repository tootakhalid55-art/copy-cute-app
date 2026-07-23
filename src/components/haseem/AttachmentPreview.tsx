// Lazy attachment card + full-screen PDF/image viewer with zoom/rotate/print/download.
import { useEffect, useState } from "react";
import { Download, Printer, ZoomIn, ZoomOut, RotateCw, Maximize2, X, Loader2, Trash2 } from "lucide-react";
import { getSignedUrl } from "@/lib/db/attachments";

export function AttachmentPreview({ attachment, onDelete }: { attachment: any; onDelete?: () => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const path = attachment.thumb_path ?? attachment.storage_path;
    if (attachment.mime_type?.startsWith("image/") || attachment.thumb_path) {
      getSignedUrl(path).then((u) => alive && setThumbUrl(u));
    }
    return () => {
      alive = false;
    };
  }, [attachment.id, attachment.storage_path, attachment.thumb_path, attachment.mime_type]);

  return (
    <>
      <div className="border border-[#eceae2] rounded-lg overflow-hidden bg-white group">
        <button
          onClick={() => setOpen(true)}
          className="block w-full aspect-video bg-[#f7f5ec] flex items-center justify-center overflow-hidden"
        >
          {thumbUrl ? (
            <img src={thumbUrl} alt={attachment.filename} className="w-full h-full object-cover" />
          ) : (
            <div className="text-xs text-[#0f2a1d]/60">{attachment.mime_type ?? "ملف"}</div>
          )}
        </button>
        <div className="p-2 flex items-center gap-2">
          <div className="flex-1 text-[11px] truncate">{attachment.filename}</div>
          {onDelete && (
            <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-600" title="حذف">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {open && <AttachmentViewer attachment={attachment} onClose={() => setOpen(false)} />}
    </>
  );
}

function AttachmentViewer({ attachment, onClose }: { attachment: any; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);

  useEffect(() => {
    let alive = true;
    getSignedUrl(attachment.storage_path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [attachment.id, attachment.storage_path]);

  const isImage = attachment.mime_type?.startsWith("image/");
  const isPdf = attachment.mime_type === "application/pdf";

  return (
    <div className="fixed inset-0 z-[1100] bg-black/80 flex flex-col" dir="rtl">
      <div className="flex items-center gap-2 p-2 bg-[#0f2a1d] text-white text-xs">
        <div className="flex-1 truncate px-2">{attachment.filename}</div>
        <button className="p-1.5 hover:bg-white/10 rounded" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button className="p-1.5 hover:bg-white/10 rounded" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="p-1.5 hover:bg-white/10 rounded" onClick={() => setRot((r) => (r + 90) % 360)}>
          <RotateCw className="w-4 h-4" />
        </button>
        <a href={url ?? "#"} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-white/10 rounded" title="ملء الشاشة">
          <Maximize2 className="w-4 h-4" />
        </a>
        <button
          className="p-1.5 hover:bg-white/10 rounded"
          onClick={() => {
            const w = window.open(url ?? "", "_blank");
            w?.addEventListener("load", () => w.print());
          }}
        >
          <Printer className="w-4 h-4" />
        </button>
        <a
          href={url ?? "#"}
          download={attachment.filename}
          className="p-1.5 hover:bg-white/10 rounded"
        >
          <Download className="w-4 h-4" />
        </a>
        <button className="p-1.5 hover:bg-white/10 rounded" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center">
        {!url ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : isPdf ? (
          <iframe
            src={`${url}#zoom=${Math.round(zoom * 100)}`}
            title={attachment.filename}
            className="w-full h-full bg-white"
            style={{ transform: `rotate(${rot}deg)` }}
          />
        ) : isImage ? (
          <img
            src={url}
            alt={attachment.filename}
            style={{ transform: `scale(${zoom}) rotate(${rot}deg)`, transformOrigin: "center" }}
            className="max-w-none transition-transform"
          />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="text-white underline">
            فتح الملف في تبويب جديد
          </a>
        )}
      </div>
    </div>
  );
}
