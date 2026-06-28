const OWNER_EMAIL = "grupogfredevarejistaoficial@gmail.com";

export function isDesignatedOwnerEmail(claims: unknown) {
  const email = String((claims as any)?.email ?? "").toLowerCase().trim();
  return email === OWNER_EMAIL;
}

export async function ensureDesignatedOwnerRole(supabase: any) {
  try {
    await supabase.rpc("ensure_designated_owner_role");
  } catch {
    // Older databases may not have the helper yet; hard permission checks below still apply.
  }
}

export async function assertAdminAccess(context: any) {
  if (isDesignatedOwnerEmail(context.claims)) {
    await ensureDesignatedOwnerRole(context.supabase);
    return;
  }

  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .in("role", ["admin", "owner"])
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export async function getAdminDb(context: any) {
  if (isDesignatedOwnerEmail(context.claims)) {
    await ensureDesignatedOwnerRole(context.supabase);
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }

  return context.supabase as any;
}