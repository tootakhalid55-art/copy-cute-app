import { useMemo, useState, type ReactNode } from "react";
import { Plus, Pencil, Trash2, Search, X, Eye, Ban } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCollection } from "@/lib/haseem/store";
import { DOC_KEYS, cancelCloudDocument, logClientEvent } from "@/lib/db/collections";
import { useOrg } from "@/lib/db/org";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState } from "./Shell";
import { nextAutoCode } from "./PartyEditorModal";


export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "email" | "tel";
  options?: (string | { label: string; value: string })[];
  required?: boolean;
  placeholder?: string;
  default?: any;
  /** Auto-generate a sequential code with this prefix for NEW records
   *  (e.g. "ITM" -> ITM-0001). Always editable by the user. */
  autoCode?: string;
};

export type ColumnDef = {
  name: string;
  label: string;
  format?: (row: any) => ReactNode;
  className?: string;
};

export function CrudModule({
  storageKey,
  title,
  subtitle,
  fields,
  columns,
  newLabel = "إضافة",
  searchIn = [],
  newPath,
  emptyTitle,
  emptyDescription,
  headerExtra,
  beforeList,
  rowActions,
  customEditor,
}: {
  storageKey: string;
  title: string;
  subtitle?: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  newLabel?: string;
  searchIn?: string[];
  newPath?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  headerExtra?: ReactNode;
  beforeList?: ReactNode;
  rowActions?: (row: any) => ReactNode;
  /** Replace the default field-list modal with a rich custom editor
   *  (used by customers/suppliers for the full tabbed party editor). */
  customEditor?: (opts: { editing: any | null; onClose: () => void; onSave: (data: any) => Promise<void> }) => ReactNode;
}) {
  const { items, addAsync, updateAsync, remove } = useCollection<any>(storageKey);
  const { currentOrgId } = useOrg();
  const navigate = useNavigate();
  const isDocCollection = !!DOC_KEYS[storageKey];
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Posted documents are financially immutable — deleting one is blocked
  // server-side (its journal entry must survive for audit). The correct
  // operation is a cancel: the server posts a reversal journal entry and
  // marks the document ملغي, which stays on record.
  const cancelPosted = async (row: any) => {
    if (!currentOrgId || cancelling) return;
    if (!confirm(`المستند ${row.ref ?? ""} مرحّل في دفتر اليومية ولا يمكن حذفه.\nسيتم إلغاؤه بإنشاء قيد عكسي وتتحول حالته إلى "ملغي". متابعة؟`)) return;
    setCancelling(row.id);
    try {
      await cancelCloudDocument(currentOrgId, row.id, "إلغاء من قائمة المستندات");
      toast.success("أُلغي المستند وأُنشئ قيد عكسي في دفتر اليومية");
      window.dispatchEvent(new CustomEvent("haseem:collection-changed", { detail: { key: storageKey } }));
    } catch (e) {
      const msg = String((e as any)?.message ?? e ?? "");
      logClientEvent("cancel-doc", `failed: ${msg.slice(0, 140)}`);
      toast.error(
        /document_has_allocations/i.test(msg)
          ? "المستند مرتبط بتسويات دفع — اعكس التسويات أولاً ثم أعد المحاولة"
          : `تعذر إلغاء المستند: ${msg.slice(0, 120)}`,
      );
    } finally {
      setCancelling(null);
    }
  };
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const t = q.trim().toLowerCase();
    const keys = searchIn.length ? searchIn : columns.map((c) => c.name);
    return items.filter((i) =>
      keys.some((k) => String(i[k] ?? "").toLowerCase().includes(t))
    );
  }, [items, q, searchIn, columns]);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (row: any) => {
    setEditing(row);
    setOpen(true);
  };

  // Prefill auto-generated sequential codes for new records (still editable).
  const autoCodeDefaults = () => {
    const d: Record<string, any> = {};
    for (const f of fields) {
      if (f.autoCode) d[f.name] = nextAutoCode(items, f.name, f.autoCode);
    }
    return d;
  };

  const handlePrimary = () => {
    if (newPath) navigate({ to: newPath });
    else openNew();
  };

  const primaryAction = (
    <PrimaryBtn onClick={handlePrimary}>
      <Plus className="w-4 h-4" />
      {newLabel}
    </PrimaryBtn>
  );


  return (
    <Shell>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex gap-2">
            {headerExtra}
            {primaryAction}
          </div>
        }
      />

      {beforeList}


      <div className="flex items-center gap-2 border border-[#eceae2] rounded-lg px-3 py-2 bg-white">
        <Search className="w-4 h-4 text-[#0f2a1d]/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث..."
          className="bg-transparent text-sm outline-none w-full"
        />
        <span className="text-xs text-[#0f2a1d]/50">{filtered.length} سجل</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? "لا توجد بيانات بعد"}
          description={emptyDescription ?? "ابدأ بإضافة أول سجل."}
          action={primaryAction}
        />
      ) : (
        <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f7f6f0] text-xs text-[#0f2a1d]/70">
                <tr className="text-right">
                  {columns.map((c) => (
                    <th key={c.name} className="py-2.5 px-3 font-medium whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eceae2]">
                {filtered.map((row) => (
                  <tr key={row.id} className="text-right hover:bg-[#fafaf7]">
                    {columns.map((c) => (
                      <td key={c.name} className={`py-2.5 px-3 ${c.className ?? ""}`}>
                        {c.format ? c.format(row) : renderValue(row[c.name])}
                      </td>
                    ))}
                    <td className="py-2.5 px-3">
                      <div className="flex justify-end gap-1">
                        {newPath ? (
                          <button
                            onClick={() => {
                              const base = newPath.replace(/\/new$/, "");
                              navigate({ to: `${base}/${row.id}` });
                            }}
                            className="p-1.5 hover:bg-[#f2f0e8] rounded"
                            aria-label="عرض / تعديل"
                            title="عرض / تعديل"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1.5 hover:bg-[#f2f0e8] rounded"
                            aria-label="تعديل"
                            title="تعديل"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {rowActions?.(row)}
                        {isDocCollection && (row.status === "مرحل" || row.dbStatus === "posted") ? (
                          <button
                            onClick={() => cancelPosted(row)}
                            disabled={cancelling === row.id}
                            className="p-1.5 hover:bg-amber-50 text-amber-600 rounded disabled:opacity-50"
                            aria-label="إلغاء بقيد عكسي"
                            title="مستند مرحّل — الإلغاء ينشئ قيداً عكسياً ويحوّله إلى ملغي"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        ) : isDocCollection && (row.status === "ملغي" || row.dbStatus === "cancelled") ? (
                          <span
                            className="p-1.5 text-[#0f2a1d]/25 cursor-not-allowed"
                            title="مستند ملغي بقيد عكسي — يبقى في السجل المحاسبي ولا يُحذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              if (confirm("حذف هذا السجل؟")) remove(row.id);
                            }}
                            className="p-1.5 hover:bg-red-50 text-red-600 rounded"
                            aria-label="حذف"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (customEditor ? (
        customEditor({
          editing,
          onClose: () => setOpen(false),
          onSave: async (data) => {
            if (editing) await updateAsync(editing.id, data);
            else await addAsync(data);
          },
        })
      ) : (
        <FormModal
          title={editing ? "تعديل" : newLabel}
          fields={fields}
          initial={editing ?? autoCodeDefaults()}
          onClose={() => setOpen(false)}
          onSubmit={async (data) => {
            try {
              if (editing) await updateAsync(editing.id, data);
              else await addAsync(data);
              setOpen(false);
            } catch {
              // The collections adapter already toasts the failure reason;
              // keep the modal open so nothing typed is lost.
            }
          }}
        />
      ))}
    </Shell>
  );
}

function renderValue(v: any): ReactNode {
  if (v == null || v === "") return <span className="text-[#0f2a1d]/40">—</span>;
  return String(v);
}

function FormModal({
  title,
  fields,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  fields: FieldDef[];
  initial: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const v: any = {};
    fields.forEach((f) => {
      v[f.name] = initial[f.name] ?? f.default ?? (f.type === "number" ? 0 : "");
    });
    return v;
  });
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div
        dir="rtl"
        className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto font-[Cairo,system-ui,sans-serif]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#eceae2]">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-[#f7f6f0] rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(values);
          }}
          className="p-5 space-y-3"
        >
          {fields.map((f) => (
            <div key={f.name} className="flex flex-col gap-1">
              <label className="text-xs text-[#0f2a1d]/70">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  required={f.required}
                  value={values[f.name] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value }))
                  }
                  className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm min-h-[70px]"
                  placeholder={f.placeholder}
                />
              ) : f.type === "select" ? (
                <select
                  required={f.required}
                  value={values[f.name] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.name]: e.target.value }))
                  }
                  className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">— اختر —</option>
                  {(f.options ?? []).map((o) => {
                    const opt = typeof o === "string" ? { label: o, value: o } : o;
                    return (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  type={f.type ?? "text"}
                  required={f.required}
                  value={values[f.name] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [f.name]:
                        f.type === "number" ? Number(e.target.value) : e.target.value,
                    }))
                  }
                  className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm"
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
          <div className="flex justify-start gap-2 pt-3 border-t border-[#eceae2]">
            <PrimaryBtn type="submit">حفظ</PrimaryBtn>
            <OutlineBtn type="button" onClick={onClose}>
              إلغاء
            </OutlineBtn>
          </div>
        </form>
      </div>
    </div>
  );
}
