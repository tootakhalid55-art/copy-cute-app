import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/lib/db/org";
import { useAuth } from "@/lib/haseem/auth";
import { ReportShell, DateRange, ReportTable, money } from "@/components/haseem/ReportShell";
import { calculateVat, r2, type VatReview, type VatRow } from "@/lib/accounting/vat-return";
import { loadVatData, saveVatReview } from "@/lib/accounting/vat-return-data";
export const Route = createFileRoute("/reports/vat-return")({ component: VAT });
const labels: Record<string, string> = {
  standard: "محلية خاضعة",
  zero: "صفرية",
  exempt: "معفاة",
  outside: "خارج النطاق",
  import: "واردات بضريبة جمركية",
  reverse: "احتساب عكسي",
  mixed: "مختلطة تحتاج تفصيلًا",
  unreviewed: "غير مصنفة",
  adjustment: "تسويات القيود",
};
function VAT() {
  const { currentOrgId, ready, currentRole } = useOrg();
  const { user } = useAuth();
  const client = useQueryClient();
  const today = new Date();
  const start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const localDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [from, setFrom] = useState(localDate(start)),
    [to, setTo] = useState(localDate(today));
  const [editing, setEditing] = useState<VatRow | null>(null);
  useEffect(() => setEditing(null), [user?.id, currentOrgId]);
  const key = ["vat-deduction-review", user?.id, currentOrgId];
  const query = useQuery({
    queryKey: key,
    enabled: ready && !!currentOrgId && !!user,
    queryFn: () => loadVatData(currentOrgId!),
  });
  const data = query.data;
  const report = calculateVat(data?.docs || [], data?.adjustments || [], from, to);
  const ledger = (data?.ledger || []).filter((e) => e.entry_date >= from && e.entry_date <= to);
  const ledgerIn = r2(ledger.reduce((s, e) => s + e.inputVat, 0)),
    ledgerOut = r2(ledger.reduce((s, e) => s + e.outputVat, 0));
  const unresolved = [...report.warnings, ...(data?.warnings || [])];
  const previewOnly =
    Math.abs(report.output - ledgerOut) > 0.02 ||
    Math.abs(report.input - ledgerIn) > 0.02 ||
    report.pending > 0 ||
    unresolved.length > 0 ||
    !data ||
    query.isFetching;
  const exportRows = () => ({
    headers: [
      "حالة التقرير",
      "الفترة",
      "المرجع",
      "التصنيف",
      "التاريخ الضريبي/الخصم",
      "الوعاء بالريال",
      "الضريبة بالريال",
      "المدخلات المقبولة",
      "المخرجات",
      "حالة المراجعة",
    ],
    rows: report.rows.map((r) => [
      previewOnly ? "مسودة غير مكتملة — لا تعتمد للإقرار" : "يلزم اعتماد المحاسب",
      `${from} — ${to}`,
      r.ref,
      labels[r.category],
      r.date,
      r.base,
      r.vat,
      r.deductible,
      r.output,
      r.issues.join("؛ ") || "تمت المراجعة",
    ]),
  });
  const canReview = ["owner", "admin", "accountant"].includes(currentRole || "");
  return (
    <ReportShell
      title="مراجعة إقرار ضريبة القيمة المضافة"
      subtitle="تقرير مساعد وفق ضوابط خصم المدخلات — لا يرسل إقرارًا إلى الهيئة"
      filters={
        <>
          <DateRange {...{ from, to, setFrom, setTo }} />
          <button onClick={() => query.refetch()}>تحديث البيانات</button>
        </>
      }
      exportRows={data && !query.isError ? exportRows : undefined}
    >
      {query.isLoading && <p role="status">جارٍ تحميل جميع المستندات والقيود…</p>}
      {query.isError && (
        <p role="alert" className="text-red-700">
          تعذر تحميل التقرير كاملًا: {String((query.error as Error).message)}. لا تعتمد الأرقام.
        </p>
      )}
      {data && !query.isError && (
        <>
          <p>
            الفترة: {from} — {to}
          </p>
          <div className="border rounded p-4 bg-amber-50">
            <strong>
              {previewOnly
                ? "مسودة غير مكتملة — لا تعتمد للإقرار"
                : "اكتملت مراجعة المستندات المعروضة — يلزم اعتماد المحاسب"}
            </strong>
            <p>
              المستندات غير المراجعة لا تُخصم ضريبتها تلقائيًا. الأرقام بالريال. المخرجات غير
              المراجعة تبقى ظاهرة لمنع إسقاط الالتزام.
            </p>
            <p>{report.pending} مستندًا أو تسوية تحتاج مراجعة.</p>
            {unresolved.map((x) => (
              <p key={x}>{x}</p>
            ))}
          </div>
          <ReportTable
            headers={[
              "التصنيف",
              "وعاء المبيعات",
              "ضريبة المخرجات",
              "وعاء المشتريات",
              "المدخلات القابلة للخصم",
            ]}
            rows={Object.entries(labels)
              .filter(([k]) => report.rows.some((r) => r.category === k))
              .map(([k, label]) => {
                const rows = report.rows.filter((r) => r.category === k);
                return [
                  label,
                  money(rows.filter((r) => !r.input).reduce((s, r) => s + r.base, 0)),
                  money(rows.reduce((s, r) => s + r.output, 0)),
                  money(rows.filter((r) => r.input).reduce((s, r) => s + r.base, 0)),
                  money(rows.reduce((s, r) => s + r.deductible, 0)),
                ];
              })}
            totalsRow={["الإجمالي", "", money(report.output), "", money(report.input)]}
          />
          <ReportTable
            headers={["المطابقة", "المخرجات", "المدخلات", "الصافي"]}
            rows={[
              [
                "حركة حسابات الضريبة خلال الفترة",
                money(ledgerOut),
                money(ledgerIn),
                money(ledgerOut - ledgerIn),
              ],
              [
                "المعالجة الضريبية الحالية",
                money(report.output),
                money(report.input),
                money(report.net),
              ],
              [
                "فرق يحتاج تفسيرًا (توقيت/أهلية/تسويات)",
                money(report.output - ledgerOut),
                money(report.input - ledgerIn),
                money(report.net - (ledgerOut - ledgerIn)),
              ],
            ]}
          />
          <p className="text-sm">
            تسويات الإلغاء تظهر مستقلة. لا تعتمد الإقرار قبل تفسير فروق المطابقة ومراجعة الأصول
            الرأسمالية، الخصم النسبي السنوي، الديون المعدومة، وما قبل التسجيل أو الأساس النقدي إن
            انطبقت. لا يتم افتراض هذه المعالجات من اسم الصنف.
          </p>
          <div className="overflow-x-auto">
            <ReportTable
              headers={[
                "المرجع",
                "التاريخ",
                "التصنيف",
                "الضريبة",
                "المقبول كمدخلات",
                "الملاحظات",
                "المراجعة",
              ]}
              rows={report.rows.map((r) => [
                r.ref,
                r.date,
                labels[r.category],
                money(r.vat),
                money(r.deductible),
                r.issues.join("؛ ") || "مراجع",
                <button
                  key={r.id}
                  disabled={!canReview}
                  onClick={() => setEditing(r)}
                  className="text-blue-700 disabled:opacity-40"
                >
                  مراجعة
                </button>,
              ])}
            />
          </div>
          <details>
            <summary>ضوابط وأساس الحساب</summary>
            <p>
              خصم المدخلات يتطلب ارتباطًا بنشاط خاضع وإثباتًا صالحًا؛ النفقات المقيدة والاستخدام
              المعفى أو الشخصي لا تخصم. الخصم النسبي يعتمد على أساس موثق وتسوية سنوية، والطريقة
              البديلة تحتاج موافقة الهيئة. ضريبة الاحتساب العكسي تظهر كمخرجات ومدخلات محتملة حسب
              الأهلية. تواريخ الاستحقاق وتوفر الإثبات والخصم مستقلة عن تاريخ إدخال المستند.
            </p>
            <a
              href="https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Input%20Tax%20Deduction.pdf"
              target="_blank"
              rel="noreferrer"
            >
              دليل خصم ضريبة المدخلات
            </a>
          </details>
        </>
      )}
      {editing && currentOrgId && (
        <Review
          key={editing.id}
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            await saveVatReview(currentOrgId, editing, v);
            await client.invalidateQueries({ queryKey: key });
            setEditing(null);
          }}
        />
      )}
    </ReportShell>
  );
}
function Review({
  row,
  onClose,
  onSave,
}: {
  row: VatRow;
  onClose: () => void;
  onSave: (v: VatReview) => Promise<void>;
}) {
  const [v, setV] = useState<VatReview>(
    row.review || {
      category: "standard",
      deduction: "none",
      percent: 0,
      taxDate: row.source.issue_date || row.source.entry_date,
      claimDate: "",
      evidenceDate: "",
      evidence: "",
      reason: "",
      proportionBasis: "",
      special: "",
      evidenceType: "invoice",
      paidPercent: 0,
      paymentDate: "",
    },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const field = (key: keyof VatReview, label: string, type = "text") => (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        value={String(v[key] ?? "")}
        onChange={(e) =>
          setV({ ...v, [key]: type === "number" ? Number(e.target.value) : e.target.value })
        }
        className="border rounded p-2"
      />
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form
        className="bg-white rounded-xl p-5 max-w-3xl w-full max-h-[90vh] overflow-y-auto space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(v);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="font-bold">مراجعة ضريبية — {row.ref}</h2>
        <p>تُحفظ المعالجة وسجل المراجعات؛ لا تُعدّل مبالغ الفاتورة أو القيود.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label>
            التصنيف
            <select
              value={v.category}
              onChange={(e) => setV({ ...v, category: e.target.value as any })}
              className="border rounded p-2 w-full"
            >
              {Object.entries(labels)
                .filter(([k]) => !["unreviewed", "adjustment"].includes(k))
                .map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          {field("taxDate", "تاريخ الاستحقاق / التسوية الضريبي", "date")}
          {row.input && (
            <>
              <label>
                أهلية الخصم
                <select
                  value={v.deduction}
                  onChange={(e) => setV({ ...v, deduction: e.target.value as any })}
                  className="border rounded p-2 w-full"
                >
                  <option value="none">غير قابل للخصم</option>
                  <option value="full">كامل — استخدام خاضع وإثبات صالح</option>
                  <option value="partial">نسبي — استخدام مختلط موثق</option>
                </select>
              </label>
              {field("claimDate", "تاريخ إدراج الخصم", "date")}
              {field("evidenceDate", "تاريخ توفر الفاتورة / الإثبات", "date")}
              {v.deduction === "partial" && field("percent", "نسبة الخصم المعتمدة %", "number")}
            </>
          )}
          <label>
            نوع الإثبات
            <select
              value={v.evidenceType || ""}
              onChange={(e) => setV({ ...v, evidenceType: e.target.value })}
              className="border rounded p-2 w-full"
            >
              <option value="">حدد النوع</option>
              <option value="invoice">فاتورة ضريبية صالحة</option>
              <option value="customs">مستند جمركي يثبت ضريبة الاستيراد</option>
              <option value="reverse">مستندات تجارية وحساب الاحتساب العكسي</option>
              <option value="approved">مستند بديل بموافقة الهيئة</option>
            </select>
          </label>
          {v.special === "أساس نقدي" && (
            <>
              {field("paidPercent", "نسبة السداد المؤكدة %", "number")}
              {field("paymentDate", "تاريخ السداد", "date")}
            </>
          )}
          {field("evidence", "مرجع الفاتورة/الجمارك/التسوية ومكان حفظ الإثبات")}
          {v.category === "reverse" &&
            field("selfAssessedVat", "ضريبة الاحتساب العكسي بعملة المستند", "number")}
          {field("reason", "أساس القرار، وأهلية المصروف وسعر الصرف إن وجد")}
          <label>
            حالة خاصة
            <select
              value={v.special}
              onChange={(e) => setV({ ...v, special: e.target.value })}
              className="border rounded p-2 w-full"
            >
              <option value="">لا يوجد</option>
              {[
                "أصل رأسمالي",
                "تسوية خصم نسبي سنوية",
                "قبل التسجيل",
                "أساس نقدي",
                "ديون معدومة",
                "نفقة مقيدة / استعمال شخصي",
                "طريقة نسبية بديلة بموافقة الهيئة",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          {field(
            "proportionBasis",
            "مذكرة النسبة/الحالة الخاصة: الحساب والسنة ومرجع الموافقة عند اللزوم",
          )}
        </div>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-4">
          <button disabled={busy} className="bg-green-900 text-white px-4 py-2 rounded">
            {busy ? "جارٍ الحفظ…" : "حفظ المراجعة"}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            إغلاق
          </button>
        </div>
      </form>
    </div>
  );
}
