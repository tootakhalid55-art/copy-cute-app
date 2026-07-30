import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, LogIn, LogOut, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, OutlineBtn, PageHeader, PrimaryBtn, Shell, StatCard } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { useAuth } from "@/lib/haseem/auth";
import { getPlatformAdminOverview, getPlatformAdminStatus, setPlatformAdminRole, startImpersonation, stopImpersonation } from "@/lib/platform-admin.functions";

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
  const { user } = useAuth();
  const { impersonation } = useOrg();
  const navigate = useNavigate();
  const statusFn = useServerFn(getPlatformAdminStatus);
  const overviewFn = useServerFn(getPlatformAdminOverview);
  const roleFn = useServerFn(setPlatformAdminRole);
  const startImpersonationFn = useServerFn(startImpersonation);
  const stopImpersonationFn = useServerFn(stopImpersonation);
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
      <div className="max-w-2xl mx-auto mt-16 rounded-xl border border-red-200 bg-white p-8">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-12 h-12 text-red-600 shrink-0 mt-1" />
          <div className="text-right">
            <h1 className="text-xl font-semibold">هذه الصفحة مخصصة لـ Super Admin</h1>
            <p className="text-sm text-[#0f2a1d]/60 mt-2">
              حسابك الحالي مسجّل دخولًا، لكنه لم يُفعّل كـ Super Admin بعد.
              يجب إضافة البريد المرتبط بهذا الحساب إلى جدول `platform_admins` من قاعدة البيانات.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm">
          <div className="rounded-lg bg-[#faf9f4] border border-[#eceae2] p-4">
            <div className="text-xs text-[#0f2a1d]/60 mb-1">البريد الحالي</div>
            <div className="font-medium" dir="ltr">{user?.email || "—"}</div>
          </div>
          <div className="rounded-lg bg-[#faf9f4] border border-[#eceae2] p-4">
            <div className="text-xs text-[#0f2a1d]/60 mb-1">معرّف الجلسة الحالي</div>
            <div className="font-medium break-all" dir="ltr">{user?.id || "—"}</div>
          </div>
          <div className="rounded-lg bg-[#faf9f4] border border-[#eceae2] p-4">
            <div className="text-xs text-[#0f2a1d]/60 mb-2">خطوة التفعيل</div>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap text-[#0f2a1d] bg-white border border-[#eceae2] rounded-lg p-3" dir="ltr">{`INSERT INTO public.platform_admins (user_id, granted_by)\nSELECT id, id\nFROM auth.users\nWHERE lower(email) = lower('${user?.email || "INFO@CANARMODERN.COM"}');`}</pre>
          </div>
          <div className="rounded-lg bg-[#eef8f0] border border-[#cfe7d4] p-4 text-[#0f5132] text-sm text-right">
            بعد تنفيذ أمر SQL، حدّث الصفحة أو سجّل الخروج ثم ادخل مرة أخرى.
          </div>
        </div>
      </div>
    </Shell>
  );

  return (
    <Shell>
      {impersonation.active && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong>وضع impersonation مفعّل</strong>
            <span className="mr-2">
              {impersonation.targetUserName || impersonation.targetUserEmail || "حساب محدد"}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold"
            onClick={async () => {
              await stopImpersonationFn();
              localStorage.removeItem("haseem:adminImpersonation");
              navigate({ to: "/platform-admin", replace: true });
              location.reload();
            }}
          >
            <LogOut className="w-4 h-4" /> إنهاء impersonation
          </button>
        </div>
      )}
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
                      className="text-xs text-[#0f5132] hover:underline inline-flex items-center gap-1"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const context = await startImpersonationFn({ data: { targetUserId: user.id } }) as unknown as {
                            targetUser: { id: string; email: string; name: string };
                            orgs: Array<{ id: string; name: string }>;
                          };
                          localStorage.setItem("haseem:adminImpersonation", JSON.stringify({
                            active: true,
                            targetUserId: context.targetUser.id,
                            targetUserName: context.targetUser.name,
                            targetUserEmail: context.targetUser.email,
                          }));
                          if (context.orgs[0]?.id) localStorage.setItem("haseem:currentOrgId", context.orgs[0].id);
                          else localStorage.removeItem("haseem:currentOrgId");
                          await load();
                          navigate({ to: "/dashboard" });
                          location.reload();
                        } catch (error) {
                          alert(error instanceof Error ? error.message : "تعذر بدء impersonation");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <LogIn className="w-3.5 h-3.5" /> Impersonate
                    </button>
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
