import { createFileRoute } from "@tanstack/react-router";
import { Shell, PageHeader, PrimaryBtn, StatCard } from "@/components/haseem/Shell";
import { Plus, Pencil, Trash2, DollarSign } from "lucide-react";

export const Route = createFileRoute("/cash/banks")({
  head: () => ({ meta: [{ title: "النقد والبنوك — حسيم" }] }),
  component: () => (
    <Shell>
      <PageHeader title="النقد والبنوك" subtitle="حسابات بنكية ومطابقة المعاملات" action={<PrimaryBtn><Plus className="w-4 h-4" />إنشاء حساب</PrimaryBtn>} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="الحسابات النشطة" value="2" />
        <div className="rounded-xl bg-white border border-[#eceae2] p-4"><div className="text-xs text-[#0f2a1d]/60">الافتراضي للفواتير</div><div className="text-lg font-semibold mt-1">غير محدد</div></div>
        <StatCard label="المؤرشفة" value="0" />
      </div>
      <div className="flex gap-2 text-sm">
        {["الكل (2)","بنك (1)","حساب نقدي (1)","خزينة (0)"].map((t,i)=>(
          <button key={t} className={`px-3 py-1.5 rounded-lg border ${i===0?"bg-[#0f2a1d] text-white border-[#0f2a1d]":"bg-white border-[#eceae2]"}`}>{t}</button>
        ))}
      </div>
      {[{name:"الحساب البنكي الرئيسي", type:"بنك"},{name:"النقدية", type:"حساب نقدي"}].map((a)=>(
        <div key={a.name} className="rounded-xl bg-white border border-[#eceae2] p-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2"><span className="text-xs bg-[#eaf5ee] text-[#0f2a1d] px-2 py-0.5 rounded">نشط</span><div className="font-semibold">{a.name}</div></div>
            <div className="text-xs text-[#0f2a1d]/60 mt-2">النوع: {a.type}</div>
            <div className="flex gap-2 mt-3"><button className="p-1.5 border border-[#eceae2] rounded"><DollarSign className="w-3.5 h-3.5" /></button><button className="p-1.5 border border-[#eceae2] rounded"><Pencil className="w-3.5 h-3.5" /></button><button className="p-1.5 border border-[#eceae2] rounded"><Trash2 className="w-3.5 h-3.5" /></button></div>
          </div>
          <div className="text-right"><div className="text-xs text-[#0f2a1d]/60">الرصيد الحالي</div><div className="text-xl font-bold mt-1">0 ﷼</div></div>
        </div>
      ))}
    </Shell>
  ),
});
