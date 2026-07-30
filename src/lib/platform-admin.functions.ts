import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminContext = {
  userId: string;
  supabase: any;
};

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function audit(admin: any, input: {
  actorUserId: string;
  action: string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from("platform_admin_audit_log").insert({
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId ?? null,
    action: input.action,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

async function isAdmin(context: AdminContext) {
  const { data, error } = await context.supabase.rpc("is_platform_admin", {
    _user_id: context.userId,
  });
  if (!error && data === true) return true;

  const { data: fallbackPlatform } = await context.supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (fallbackPlatform?.user_id) return true;

  const { data: fallbackSuper } = await context.supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  return Boolean(fallbackSuper?.user_id);
}

async function assertPlatformAdmin(context: AdminContext) {
  if (!(await isAdmin(context))) {
    throw new Error("forbidden: platform super admin required");
  }
}

async function loadUsers(admin: any) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  return data.users;
}

export const getPlatformAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isSuperAdmin = await isAdmin(context as AdminContext);
    if (isSuperAdmin) {
      const admin = await adminClient();
      await audit(admin, {
        actorUserId: context.userId,
        action: "platform_admin_access",
        metadata: { area: "status", at: new Date().toISOString() },
      });
    }
    return { isSuperAdmin };
  });

export const getPlatformAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context as AdminContext);
    const admin = await adminClient();
    await audit(admin, {
      actorUserId: context.userId,
      action: "platform_admin_access",
      metadata: { area: "overview", at: new Date().toISOString() },
    });
    const [orgsResult, membersResult, adminsResult, superAdminsResult, users] = await Promise.all([
      admin.from("organizations").select("id,name,vat_number,created_at").order("created_at", { ascending: false }),
      admin.from("org_members").select("org_id,user_id,role"),
      admin.from("platform_admins").select("user_id,granted_at"),
      admin.from("super_admins").select("user_id,granted_at"),
      loadUsers(admin),
    ]);
    for (const result of [orgsResult, membersResult, adminsResult, superAdminsResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    const allAdmins = new Set<string>([
      ...adminsResult.data.map((row: any) => row.user_id),
      ...superAdminsResult.data.map((row: any) => row.user_id),
    ]);
    const mappedUsers = users.map((user: any) => ({
      id: user.id,
      email: user.email || "",
      name: user.user_metadata?.full_name || user.email?.split("@")[0] || "مستخدم",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      isSuperAdmin: allAdmins.has(user.id),
    }));
    return {
      organizations: orgsResult.data.map((org: any) => ({
        ...org,
        memberCount: membersResult.data.filter((member: any) => member.org_id === org.id).length,
      })),
      users: mappedUsers,
      stats: {
        organizations: orgsResult.data.length,
        users: mappedUsers.length,
        memberships: membersResult.data.length,
        superAdmins: allAdmins.size,
      },
    };
  });

export const setPlatformAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as { email?: string; active?: boolean };
    const email = value?.email?.trim().toLowerCase();
    if (!email || typeof value.active !== "boolean") throw new Error("email and active are required");
    return { email, active: value.active };
  })
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context as AdminContext);
    const admin = await adminClient();
    const users = await loadUsers(admin);
    const target = users.find((user: any) => user.email?.toLowerCase() === data.email);
    if (!target) throw new Error("user_not_found");

    const { data: activeAdmins, error: countError } = await admin
      .from("platform_admins")
      .select("user_id");
    if (countError) throw new Error(countError.message);
    if (!data.active && target.id === context.userId && activeAdmins.length <= 1) {
      throw new Error("cannot_revoke_last_super_admin");
    }

    if (data.active) {
      const { error } = await admin.from("platform_admins").upsert({
        user_id: target.id,
        granted_by: context.userId,
        granted_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await admin.from("super_admins").upsert({
        user_id: target.id,
        granted_by: context.userId,
        granted_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      await audit(admin, {
        actorUserId: context.userId,
        targetUserId: target.id,
        action: "grant_super_admin",
        metadata: { email: data.email },
      });
    } else {
      const { error } = await admin.from("platform_admins").delete().eq("user_id", target.id);
      if (error) throw new Error(error.message);
      const { error: superError } = await admin.from("super_admins").delete().eq("user_id", target.id);
      if (superError) throw new Error(superError.message);
      await audit(admin, {
        actorUserId: context.userId,
        targetUserId: target.id,
        action: "revoke_super_admin",
        metadata: { email: data.email },
      });
    }
    return { ok: true };
  });

export const getImpersonationContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as { targetUserId?: string };
    if (!value.targetUserId) throw new Error("targetUserId is required");
    return { targetUserId: value.targetUserId };
  })
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context as AdminContext);
    const admin = await adminClient();
    const users = await loadUsers(admin);
    const target = users.find((user: any) => user.id === data.targetUserId);
    if (!target) throw new Error("user_not_found");

    const { data: memberships, error: mErr } = await admin
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", target.id);
    if (mErr) throw new Error(mErr.message);

    const orgIds = (memberships ?? []).map((row: any) => row.org_id);
    const orgsResult = orgIds.length
      ? await admin
          .from("organizations")
          .select("id,name,name_en,vat_number,cr_number,currency,logo_url,stamp_url")
          .in("id", orgIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (orgsResult.error) throw new Error(orgsResult.error.message);

    await audit(admin, {
      actorUserId: context.userId,
      targetUserId: target.id,
      action: "impersonation_context_load",
      metadata: { email: target.email ?? "", orgCount: orgIds.length },
    });

    return {
      targetUser: {
        id: target.id,
        email: target.email || "",
        name: target.user_metadata?.full_name || target.email?.split("@")[0] || "مستخدم",
      },
      orgs: orgsResult.data ?? [],
      memberships: memberships ?? [],
    };
  });

export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as { targetUserId?: string };
    if (!value.targetUserId) throw new Error("targetUserId is required");
    return { targetUserId: value.targetUserId };
  })
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context as AdminContext);
    const admin = await adminClient();
    const users = await loadUsers(admin);
    const target = users.find((user: any) => user.id === data.targetUserId);
    if (!target) throw new Error("user_not_found");
    await audit(admin, {
      actorUserId: context.userId,
      targetUserId: target.id,
      action: "impersonation_start",
      metadata: { email: target.email ?? "" },
    });
    return { ok: true };
  });

export const stopImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context as AdminContext);
    const admin = await adminClient();
    await audit(admin, {
      actorUserId: context.userId,
      action: "impersonation_end",
      metadata: { at: new Date().toISOString() },
    });
    return { ok: true };
  });

export const logImpersonationOrgSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as { targetUserId?: string; orgId?: string };
    if (!value.targetUserId || !value.orgId) throw new Error("targetUserId and orgId are required");
    return { targetUserId: value.targetUserId, orgId: value.orgId };
  })
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context as AdminContext);
    const admin = await adminClient();
    await audit(admin, {
      actorUserId: context.userId,
      targetUserId: data.targetUserId,
      action: "impersonation_context_switch_org",
      metadata: { orgId: data.orgId },
    });
    return { ok: true };
  });
