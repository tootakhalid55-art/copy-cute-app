import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Upload, Camera, Check, FileText, Loader2 } from "lucide-react";
import { useCollection, useKV } from "@/lib/haseem/store";

export const Route = createFileRoute("/inbox-upload/$token")({
  head: () => ({ meta: [
    { title: "رفع فاتورة — حسيم" },
    { name: "description", content: "ارفع فاتورتك مباشرة إلى صندوق الوارد" },
  ]}),
  component: PublicUpload,
});

function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}
function newId() {
  return globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2);
}

function PublicUpload() {
  const { token } = Route.useParams();
  const [settings] = useKV<any>("inbox-settings", { shareToken: "" });
  const { add } = useCollection<any>("incoming-docs");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const valid = settings?.shareToken && settings.shareToken === token;

  const handle = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (!name.trim()) { alert("يرجى إدخال اسمك أو اسم شركتك"); return; }
    setBusy(true);
    let count = 0;
    for (const f of Array.from(files)) {
      const dataUrl = await fileToDataURL(f);
      add({
        id: newId(), source: "link", from: name, subject: note,
        filename: f.name, mime: f.type, dataUrl,
        receivedAt: Date.now(), status: "queued",
      });
      count++;
    }
    setDone((d) => d + count);
    setBusy(false);
  }, [add, name, note]);

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f4] p-4" dir="rtl">
        <div className="bg-white rounded-xl p-6 max-w-md text-center border border-[#eceae2]">
          <div className="font-bold text-lg mb-1">رابط غير صالح</div>
          <div className="text-sm text-[#0f2a1d]/60">تأكد من الرابط الذي زودك به العميل.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f4] p-4 flex items-center justify-center" dir="rtl">
      <div className="bg-white rounded-2xl border border-[#eceae2] max-w-lg w-full p-6 space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-[#0f2a1d] text-white flex items-center justify-center mx-auto">
            <FileText className="w-7 h-7" />
          </div>
          <div className="font-bold text-xl mt-2">ارفع فاتورتك</div>
          <p className="text-sm text-[#0f2a1d]/60">ستصل الفاتورة مباشرة لقسم المحاسبة لمعالجتها.</p>
        </div>

        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="اسمك أو اسم شركتك *"
          className="w-full border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
        <textarea value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="ملاحظات (اختياري)" rows={2}
          className="w-full border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => uploadRef.current?.click()}
            className="rounded-lg border-2 border-dashed border-[#eceae2] p-4 hover:bg-[#faf9f4] flex flex-col items-center gap-1">
            <Upload className="w-6 h-6 text-[#0f2a1d]" />
            <span className="text-sm font-semibold">اختر ملفات</span>
            <span className="text-xs text-[#0f2a1d]/60">PDF · صور</span>
          </button>
          <button onClick={() => cameraRef.current?.click()}
            className="rounded-lg border-2 border-dashed border-[#eceae2] p-4 hover:bg-[#faf9f4] flex flex-col items-center gap-1">
            <Camera className="w-6 h-6 text-[#0f2a1d]" />
            <span className="text-sm font-semibold">تصوير الآن</span>
            <span className="text-xs text-[#0f2a1d]/60">من الجوال</span>
          </button>
        </div>
        <input ref={uploadRef} type="file" accept="application/pdf,image/*" multiple hidden
          onChange={(e) => handle(e.target.files)} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => handle(e.target.files)} />

        {busy && (
          <div className="text-center text-sm text-[#0f2a1d]/70 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري الرفع...
          </div>
        )}
        {done > 0 && !busy && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-center gap-2">
            <Check className="w-4 h-4" /> تم رفع {done} مستند بنجاح — شكراً لك.
          </div>
        )}
      </div>
    </div>
  );
}
