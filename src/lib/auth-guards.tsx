// Client-side route guards. This app's session lives entirely in the
// browser (Supabase's localStorage-backed client, resolved async via
// useAuth()/useOrg()) with no SSR-aware cookie session — a router-level
// `beforeLoad` guard runs during SSR too, where that client can't see the
// session at all, and will incorrectly deny even a legitimate owner. So
// enforcement here mirrors the pattern platform-admin.tsx already used
// successfully: gate rendering client-side, after useAuth/useOrg resolve.
//
// This is not a security boundary by itself — every mutation behind these
// pages must still check permissions server-side (see assertPlatformAdmin
// in platform-admin.functions.ts, and RLS policies on the underlying tables).
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useOrg } from "@/lib/db/org";

/** Wrap a settings page's content with this. Renders nothing (and redirects
 * to /dashboard) until we've confirmed the signed-in user is the org owner —
 * every invited sub-account (admin/accountant/user/viewer) is denied by
 * default. Shows a loading state while org/role data is still resolving,
 * never the protected content, so there's no flash of restricted UI. */
export function RequireOrgOwner({ children }: { children: React.ReactNode }) {
  const { ready, isOrgOwner, currentOrgId } = useOrg();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && currentOrgId && !isOrgOwner) {
      navigate({ to: "/dashboard" });
    }
  }, [ready, currentOrgId, isOrgOwner, navigate]);

  if (!ready || !currentOrgId || !isOrgOwner) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-[#0f2a1d]/50">
        جاري التحقق من الصلاحيات...
      </div>
    );
  }

  return <>{children}</>;
}
