import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";

export const Route = createFileRoute("/select-organization")({
  head: () => ({ meta: [{ title: "اختر المنشأة — حسيم" }] }),
  component: () => (
    <Shell>
      <div className="max-w-2xl mx-auto rounded-xl bg-white border border-[#eceae2] p-8 mt-6">
        <h1 className="text-xl font-bold text-center">اختر المنشأة</h1>
        <p className="text-sm text-[#0f2a1d]/60 text-center mt-1">اختر المنشأة التي تريد العمل عليها</p>
        <div className="mt-6 border-2 border-[#0f2a1d] rounded-xl p-5 bg-[#f7fbf8]">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">شركة كنار الحديثة للمقاولات العامة</div>
              <div className="text-xs text-[#0f2a1d]/60 mt-1">CANAR MODERN GENARAL CONTRACTING CO.</div>
              <div className="text-xs text-[#0f2a1d]/60">VAT: 312756062700003</div>
            </div>
            <div className="w-4 h-4 rounded-full bg-[#0f2a1d]" />
          </div>
        </div>
        <label className="flex items-center gap-2 mt-4 text-sm"><input type="checkbox" defaultChecked /> تذكر اختياري</label>
        <div className="flex gap-2 mt-4">
          <Link to="/dashboard" className="flex-1"><PrimaryBtn className="w-full justify-center">متابعة</PrimaryBtn></Link>
          <OutlineBtn>إنشاء منشأة جديدة</OutlineBtn>
        </div>
      </div>
    </Shell>
  ),
});
