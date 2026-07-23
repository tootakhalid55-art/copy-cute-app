// Drag & drop, multi-file uploader with per-file progress, retry, and cancel.
// Uses uploadAttachment() from src/lib/db/attachments.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, X, RotateCw, CheckCircle2, AlertTriangle, File as FileIcon, Loader2 } from "lucide-react";
import { uploadAttachment, listAttachments, deleteAttachment, type UploadHandle } from "@/lib/db/attachments";
import { AttachmentPreview } from "./AttachmentPreview";

type Props = {
  orgId: string;
  entityType: string; // "document" | "inbox"
  entityId: string;
  className?: string;
  onUploadingChange?: (uploading: boolean) => void;
};

export function AttachmentUploader({ orgId, entityType, entityId, className, onUploadingChange }: Props) {
  const [handles, setHandles] = useState<UploadHandle[]>([]);
  const [existing, setExisting] = useState<any[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listAttachments(orgId, entityType, entityId);
      setExisting(list);
    } catch (e) {
      console.error(e);
    }
  }, [orgId, entityType, entityId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const active = handles.some((h) => h.status === "uploading" || h.status === "processing" || h.status === "queued");
    onUploadingChange?.(active);
  }, [handles, onUploadingChange]);

  const push = useCallback((h: UploadHandle) => {
    setHandles((prev) => {
      const i = prev.findIndex((p) => p.id === h.id);
      if (i < 0) return [...prev, h];
      const copy = [...prev];
      copy[i] = { ...h };
      return copy;
    });
    if (h.status === "done") refresh();
  }, [refresh]);

  const startUpload = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      for (const f of arr) {
        const h = uploadAttachment(f, { orgId, entityType, entityId, onProgress: push });
        setHandles((prev) => [...prev, h]);
      }
    },
    [orgId, entityType, entityId, push],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) startUpload(e.dataTransfer.files);
  };

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragging ? "border-[#0f2a1d] bg-[#f7f5ec]" : "border-[#eceae2] bg-white"}`}
      >
        <UploadCloud className="w-8 h-8 mx-auto text-[#0f2a1d]/70 mb-2" />
        <div className="text-sm font-semibold text-[#0f2a1d]">اسحب الملفات هنا أو اضغط للرفع</div>
        <div className="text-xs text-[#0f2a1d]/60 mt-1">صور، PDF، ملفات Office — رفع متعدد ومتوازي</div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold hover:opacity-90"
        >
          اختيار ملفات
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && startUpload(e.target.files)}
        />
      </div>

      {handles.length > 0 && (
        <ul className="mt-3 space-y-2">
          {handles.map((h) => (
            <li key={h.id} className="flex items-center gap-3 bg-white border border-[#eceae2] rounded-lg p-2">
              <FileIcon className="w-4 h-4 text-[#0f2a1d]/60" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{h.file.name}</div>
                <div className="h-1.5 bg-[#f7f5ec] rounded-full overflow-hidden mt-1">
                  <div
                    className={`h-full transition-all ${h.status === "failed" ? "bg-red-500" : "bg-[#0f2a1d]"}`}
                    style={{ width: `${Math.round(h.progress * 100)}%` }}
                  />
                </div>
                {h.error && <div className="text-[11px] text-red-600 mt-1">{h.error}</div>}
              </div>
              <div className="text-xs flex items-center gap-2">
                {h.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-[#0f2a1d]" />}
                {h.status === "processing" && <Loader2 className="w-4 h-4 animate-spin text-[#0f2a1d]" />}
                {h.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                {h.status === "failed" && <AlertTriangle className="w-4 h-4 text-red-600" />}
                {h.status === "failed" && (
                  <button
                    onClick={() => h.retry()}
                    className="p-1 rounded hover:bg-[#f7f5ec]"
                    title="إعادة المحاولة"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                )}
                {(h.status === "uploading" || h.status === "processing") && (
                  <button onClick={() => h.abort()} className="p-1 rounded hover:bg-[#f7f5ec]" title="إلغاء">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {existing.length > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {existing.map((a) => (
            <AttachmentPreview
              key={a.id}
              attachment={a}
              onDelete={async () => {
                await deleteAttachment(a.id, orgId);
                refresh();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
