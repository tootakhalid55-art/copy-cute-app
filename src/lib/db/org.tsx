import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/haseem/auth";
import { getImpersonationContext, logImpersonationOrgSwitch } from "@/lib/platform-admin.functions";

export type Org = {
  id: string;
  name: string;
  name_en: string | null;
  vat_number: string | null;
  cr_number: string | null;
  currency: string | null;
  logo_url: string | null;
  stamp_url: string | null;
};

type Ctx = {
  ready: boolean;
  orgs: Org[];
  currentOrgId: string | null;
  currentOrg: Org | null;
  setCurrentOrg: (id: string) => void;
  createOrg: (input: { name: string; vat_number?: string; cr_number?: string }) => Promise<Org | null>;
  reload: () => Promise<void>;
  impersonation: {
    active: boolean;
    targetUserId: string | null;
    targetUserName: string | null;
    targetUserEmail: string | null;
  };
};
const OrgCtx = createContext<Ctx | null>(null);

const LS_KEY = "haseem:currentOrgId";
const IMPERSONATION_KEY = "haseem:adminImpersonation";

type ImpersonationStorage = {
  active: boolean;
  targetUserId: string;
  targetUserName?: string;
  targetUserEmail?: string;
};

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const impersonationFn = useServerFn(getImpersonationContext);
  const logSwitchFn = useServerFn(logImpersonationOrgSwitch);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(null);
  const [impersonation, setImpersonation] = useState<Ctx["impersonation"]>({
    active: false,
    targetUserId: null,
    targetUserName: null,
    targetUserEmail: null,
  });
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setOrgs([]);
      setCurrentOrgIdState(null);
      setImpersonation({ active: false, targetUserId: null, targetUserName: null, targetUserEmail: null });
      if (typeof window !== "undefined") localStorage.removeItem(IMPERSONATION_KEY);
      setReady(true);
      return;
    }
    const impersonationValue = typeof window !== "undefined" ? localStorage.getItem(IMPERSONATION_KEY) : null;
    let impersonationState: ImpersonationStorage | null = null;
    if (impersonationValue) {
      try {
        impersonationState = JSON.parse(impersonationValue) as ImpersonationStorage;
      } catch {
        localStorage.removeItem(IMPERSONATION_KEY);
      }
    }
    if (impersonationState?.targetUserId) {
      const context = await impersonationFn({ data: { targetUserId: impersonationState.targetUserId } }) as {
        targetUser: { id: string; email: string; name: string };
        orgs: Org[];
      };
      setImpersonation({
        active: true,
        targetUserId: context.targetUser.id,
        targetUserName: context.targetUser.name,
        targetUserEmail: context.targetUser.email,
      });
      setOrgs(context.orgs ?? []);
      const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
      const pick = saved && context.orgs.find((o) => o.id === saved) ? saved : context.orgs[0]?.id ?? null;
      setCurrentOrgIdState(pick);
      if (pick && typeof window !== "undefined") localStorage.setItem(LS_KEY, pick);
      setReady(true);
      return;
    }
    // memberships → orgs
    const { data: memberships, error: mErr } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id);
    if (mErr) {
      console.error("[OrgProvider] memberships failed", mErr);
      setReady(true);
      return;
    }
    const ids = (memberships ?? []).map((m) => m.org_id);
    if (ids.length === 0) {
      setOrgs([]);
      setCurrentOrgIdState(null);
      setReady(true);
      return;
    }
    const { data: rows, error: oErr } = await supabase
      .from("organizations")
      .select("id,name,name_en,vat_number,cr_number,currency,logo_url,stamp_url")
      .in("id", ids)
      .order("created_at", { ascending: true });
    if (oErr) {
      console.error("[OrgProvider] orgs failed", oErr);
      setReady(true);
      return;
    }
    const list = (rows ?? []) as Org[];
    setOrgs(list);
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    const pick = saved && list.find((o) => o.id === saved) ? saved : list[0]?.id ?? null;
    setCurrentOrgIdState(pick);
    if (pick && typeof window !== "undefined") localStorage.setItem(LS_KEY, pick);
    setImpersonation({ active: false, targetUserId: null, targetUserName: null, targetUserEmail: null });
    if (typeof window !== "undefined") localStorage.removeItem(IMPERSONATION_KEY);
    setReady(true);
  }, [impersonationFn, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (impersonation.active && impersonation.targetUserId) {
      localStorage.setItem(IMPERSONATION_KEY, JSON.stringify({
        active: true,
        targetUserId: impersonation.targetUserId,
        targetUserName: impersonation.targetUserName ?? undefined,
        targetUserEmail: impersonation.targetUserEmail ?? undefined,
      } satisfies ImpersonationStorage));
      return;
    }
    localStorage.removeItem(IMPERSONATION_KEY);
  }, [impersonation]);

  useEffect(() => {
    if (!authReady) return;
    setReady(false);
    load();
  }, [authReady, load]);

  const setCurrentOrg = useCallback((id: string) => {
    setCurrentOrgIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, id);
    if (impersonation.active && impersonation.targetUserId) {
      void logSwitchFn({ data: { targetUserId: impersonation.targetUserId, orgId: id } });
    }
  }, [impersonation.active, impersonation.targetUserId, logSwitchFn]);

  const createOrg = useCallback<Ctx["createOrg"]>(
    async (input) => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("organizations")
        .insert({
          name: input.name,
          vat_number: input.vat_number ?? null,
          cr_number: input.cr_number ?? null,
          created_by: user.id,
        })
        .select("id,name,name_en,vat_number,cr_number,currency,logo_url,stamp_url")
        .single();
      if (error || !data) {
        console.error("[OrgProvider] createOrg failed", error);
        return null;
      }
      // The add_org_owner trigger auto-creates the owner membership.
      await load();
      setCurrentOrg(data.id);
      return data as Org;
    },
    [user, load, setCurrentOrg],
  );

  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? null;

  return (
    <OrgCtx.Provider
      value={{ ready, orgs, currentOrgId, currentOrg, setCurrentOrg, createOrg, reload: load, impersonation }}
    >
      {children}
    </OrgCtx.Provider>
  );
}

export function useOrg() {
  const c = useContext(OrgCtx);
  if (!c) throw new Error("OrgProvider missing");
  return c;
}
