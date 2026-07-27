import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, OutlineBtn, PageHeader, PrimaryBtn, Shell, StatCard } from "@/components/haseem/Shell";
import { getPlatformAdminOverview, getPlatformAdminStatus, setPlatformAdminRole } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/platform-admin")({
  head: () => ({ meta: [{ title: "إدارة المنصة — كنار" }] }),
  component: PlatformAdminPage,
});

type UserRow = {
  id: string; email: string; name: string; createdAt: string;
  lastSignInAt: string | null; isSuperAdmin: boolean;
};
type OrgRow = { id: string; name: string; vat_number: string | null; created_at: string; memberCount: number };
type Overview = {
  users: UserRow[]; organizations: OrgRow[];
  stats: { organizations: number; users: number; memberships: number; superAdmins: number };
};

function PlatformAdminPage() {
  const statusFn = useServerFn(getPlatformAdminStatus);
  const overviewFn = useServerFn(getPlatformAdminOverview);
  const roleFn = useServerFn(setPlatformAdminRole);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const status = await statusFn() as { isSuperAdmin: boolean };
    setAllowed(status.isSuperAdmin);
    if (status.isSuperAdmin) setOverview(await overviewFn() as Overview);
  }, [overviewFn, statusFn]);
  useEffect(() => { load().catch(() => setAllowed(false)); }, [load]);

  const users = useMemo(() => overview?.users.filter((user) =>
    !query || `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())
  ) || [], [overview, query]);

  if (allowed === null) return <Shell><div className="p-12 text-center text-sm">جاري التحقق من صلاحيات إدارة المنصة…</div></Shell>;
  if (!allowed) return (
    <Shell>
      <div className="max-w-xl mx-auto mt-16 rounded-xl border border-red-200 bg-white p-8 text-center">
        <ShieldCheck className="w-12 h-12 text-red-600 mx-auto mb-3" />
        <h1 className="text-xl font-semibold">هذه الصفحة مخصصة لـ Super Admin</h1>
        <p className="text-sm text-[#0f2a1d]/60 mt-2">صلاحية مدير المنشأة لا تمنح الوصول إلى إدارة المنصة. يجب تفعيل حسابك أولًا من قاعدة البيانات بواسطة مشغّل موثوق.</p>
      </div>
    </Shell>
  );

  return (
    <Shell>
      <PageHeader
        title="إدارة المنصة"
        subtitle="لوحة Super Admin لإدارة المنشآت والمستخدمين وصلاحيات الإدارة العليا."
        action={<OutlineBtn onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</OutlineBtn>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="المنشآت" value={String(overview?.stats.organizations || 0)} />
        <StatCard label="المستخدمون" value={String(overview?.stats.users || 0)} />
        <StatCard label="العضويات" value={String(overview?.stats.memberships || 0)} />
        <StatCard label="Super Admin" value={String(overview?.stats.superAdmins || 0)} valueClass="text-emerald-700" />
      </div>

      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-4">
        <section className="rounded-xl border border-[#eceae2] bg-white">
          <div className="p-4 border-b border-[#eceae2] flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-2 font-semibold"><Users className="w-4 h-4" /> المستخدمون</div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم أو البريد" className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-[#faf9f4] text-xs"><tr><th className="p-3">المستخدم</th><th className="p-3">آخر دخول</th><th className="p-3">الصلاحية</th></tr></thead>
              <tbody className="divide-y divide-[#eceae2]">{users.map((user) => <tr key={user.id}>
                <td className="p-3"><div className="font-medium">{user.name}</div><div className="text-xs text-[#0f2a1d]/50">{user.email}</div></td>
                <td className="p-3 text-xs">{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString("ar-SA") : "—"}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={user.isSuperAdmin ? "green" : "neutral"}>{user.isSuperAdmin ? "Super Admin" : "مستخدم"}</Badge>
                    <button
                      type="button"
                      disabled={busy}
                      className={`text-xs hover:underline ${user.isSuperAdmin ? "text-red-700" : "text-[#0f5132]"}`}
                      onClick={async () => {
                        if (user.isSuperAdmin && !confirm(`سحب صلاحية Super Admin من ${user.email}؟`)) return;
                        setBusy(true);
                        try { await roleFn({ data: { email: user.email, active: !user.isSuperAdmin } }); await load(); }
                        catch (error) { alert(error instanceof Error ? error.message : "تعذر تحديث الصلاحية"); }
                        finally { setBusy(false); }
                      }}
                    >
                      {user.isSuperAdmin ? "سحب الصلاحية" : "ترقية"}
                    </button>
                  </div>
                </td>
              </tr>)}</tbody>
            </table>
          </div>
          <form className="p-4 border-t border-[#eceae2] flex flex-wrap gap-2" onSubmit={async (event) => {
            event.preventDefault(); setBusy(true);
            try { await roleFn({ data: { email, active: true } }); setEmail(""); await load(); }
            catch (error) { alert(error instanceof Error ? error.message : "تعذر منح الصلاحية"); }
            finally { setBusy(false); }
          }}>
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="بريد المستخدم المراد ترقيته" className="flex-1 min-w-56 border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
            <PrimaryBtn type="submit" disabled={busy}>{busy ? "جاري الحفظ…" : "منح Super Admin"}</PrimaryBtn>
          </form>
        </section>

        <section className="rounded-xl border border-[#eceae2] bg-white">
          <div className="p-4 border-b border-[#eceae2] flex items-center gap-2 font-semibold"><Building2 className="w-4 h-4" /> المنشآت</div>
          <div className="divide-y divide-[#eceae2]">{overview?.organizations.map((org) => <div key={org.id} className="p-4 flex justify-between gap-3">
            <div><div className="font-medium">{org.name}</div><div className="text-xs text-[#0f2a1d]/50">{org.vat_number || "بدون رقم ضريبي"}</div></div>
            <Badge tone="neutral">{org.memberCount} مستخدم</Badge>
          </div>)}</div>
        </section>
      </div>
    </Shell>
  );
}
