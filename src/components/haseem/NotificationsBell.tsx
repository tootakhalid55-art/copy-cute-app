// Header bell showing the org's latest in-app notifications (documents
// posted/approved, workflow events...) from the notifications queue.
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useOrg } from "@/lib/db/org";
import { listNotifications, markNotificationRead } from "@/lib/db/notifications";

type Row = { id: string; title: string; body?: string | null; created_at: string; read_at?: string | null };

export function NotificationsBell() {
  const { currentOrgId } = useOrg();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const refresh = () => {
    if (!currentOrgId) return;
    listNotifications(currentOrgId, 15)
      .then((data) => setRows(data as Row[]))
      .catch(() => setRows([]));
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  const unread = rows.filter((r) => !r.read_at).length;
  if (!currentOrgId) return null;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) refresh(); }}
        className="relative w-9 h-9 rounded-lg border border-[#eceae2] flex items-center justify-center hover:bg-[#f7f6f0]"
        aria-label="الإشعارات"
        title="الإشعارات"
      >
        <Bell className="w-4 h-4 text-[#0f2a1d]" />
        {unread > 0 && (
          <span className="absolute -top-1 -left-1 min-w-4 h-4 px-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-80 max-h-96 overflow-auto bg-white border border-[#eceae2] rounded-lg shadow-lg z-50 text-right">
            <div className="px-3 py-2 border-b border-[#eceae2] text-sm font-semibold">الإشعارات</div>
            {rows.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[#0f2a1d]/50">لا توجد إشعارات</div>
            ) : (
              <ul className="divide-y divide-[#eceae2]">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={`px-3 py-2.5 text-sm cursor-default ${r.read_at ? "" : "bg-[#f2f9f4]"}`}
                    onMouseEnter={() => {
                      if (!r.read_at) {
                        markNotificationRead(r.id);
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, read_at: new Date().toISOString() } : x)));
                      }
                    }}
                  >
                    <div className="font-medium leading-snug">{r.title}</div>
                    {r.body && <div className="text-xs text-[#0f2a1d]/60 mt-0.5 line-clamp-2">{r.body}</div>}
                    <div className="text-[10px] text-[#0f2a1d]/40 mt-1">{new Date(r.created_at).toLocaleString("ar-SA")}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
