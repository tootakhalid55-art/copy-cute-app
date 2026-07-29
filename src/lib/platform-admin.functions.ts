import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPlatformAdmin(context: any) {
  const { data, error } = await (context.supabase as any).rpc("is_platform_admin", {
    _user_id: context.userId,
  });
  if (!error && data === true) return;

  const { data: fallbackData, error: fallbackError } = await (context.supabase as any)
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (!fallbackError && fallbackData?.user_id) return;
  throw new Error("forbidden: platform super admin required");
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const getPlatformAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (!error) return { isSuperAdmin: data === true };

    const { data: fallbackData } = await (context.supabase as any)
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    return { isSuperAdmin: Boolean(fallbackData?.user_id) };
  });

export const getPlatformAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const admin = await adminClient();
    const [orgsResult, membersResult, adminsResult, usersResult] = await Promise.all([
      admin.from("organizations").select("id,name,vat_number,created_at").order("created_at", { ascending: false }),
      admin.from("org_members").select("org_id,user_id,role"),
      admin.from("platform_admins").select("user_id,granted_at"),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    for (const result of [orgsResult, membersResult, adminsResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    if (usersResult.error) throw new Error(usersResult.error.message);
    const users = usersResult.data.users.map((user: any) => ({
      id: user.id,
      email: user.email || "",
      name: user.user_metadata?.full_name || user.email?.split("@")[0] || "مستخدم",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      isSuperAdmin: adminsResult.data.some((row: any) => row.user_id === user.id),
    }));
    return {
      organizations: orgsResult.data.map((org: any) => ({
        ...org,
        memberCount: membersResult.data.filter((member: any) => member.org_id === org.id).length,
      })),
      users,
      stats: {
        organizations: orgsResult.data.length,
        users: users.length,
        memberships: membersResult.data.length,
        superAdmins: adminsResult.data.length,
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
    await assertPlatformAdmin(context);
    const admin = await adminClient();
    const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersResult.error) throw new Error(usersResult.error.message);
    const target = usersResult.data.users.find((user: any) => user.email?.toLowerCase() === data.email);
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
      await admin.from("platform_admin_audit_log").insert({
        actor_user_id: context.userId,
        target_user_id: target.id,
        action: "grant_super_admin",
        metadata: { email: data.email },
      });
    } else {
      const { error } = await admin.from("platform_admins").delete().eq("user_id", target.id);
      if (error) throw new Error(error.message);
      await admin.from("platform_admin_audit_log").insert({
        actor_user_id: context.userId,
        target_user_id: target.id,
        action: "revoke_super_admin",
        metadata: { email: data.email },
      });
    }
    return { ok: true };
  });
