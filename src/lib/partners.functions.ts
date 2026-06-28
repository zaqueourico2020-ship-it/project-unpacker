import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdminAccess, getAdminDb } from "@/lib/admin-access";

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

function slugify(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "loja";
}

function isValidCPF(cpf: string) {
  cpf = onlyDigits(cpf);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}
function isValidCNPJ(cnpj: string) {
  cnpj = onlyDigits(cnpj);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const w = base.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let s = 0;
    for (let i = 0; i < base.length; i++) s += parseInt(base[i]) * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13]);
}

const Endereco = z.object({
  cep: z.string().max(20),
  rua: z.string().min(1).max(200),
  numero: z.string().min(1).max(20),
  complemento: z.string().max(120).optional().nullable(),
  bairro: z.string().min(1).max(120),
  cidade: z.string().min(1).max(120),
  estado: z.string().min(2).max(2),
});

const RegisterInput = z.object({
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(2).max(160),
  documento: z.string().min(11).max(20),
  email: z.string().email().max(255),
  telefone: z.string().min(8).max(30),
  password: z.string().min(6).max(72),
  endereco: Endereco,
  nome_loja: z.string().min(2).max(120),
  descricao: z.string().max(2000).optional().nullable(),
  logo_url: z.string().max(5_000_000).optional().nullable(),
  banner_url: z.string().max(5_000_000).optional().nullable(),
});

export const registerPartner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RegisterInput.parse(d))
  .handler(async ({ data }) => {
    const doc = onlyDigits(data.documento);
    const email = data.email.trim().toLowerCase();
    if (data.tipo === "PF" && !isValidCPF(doc)) throw new Error("CPF inválido.");
    if (data.tipo === "PJ" && !isValidCNPJ(doc)) throw new Error("CNPJ inválido.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: existingDoc, error: existingDocError } = await admin
      .from("partners").select("id").eq("documento", doc).maybeSingle();
    if (existingDocError) throw new Error("Não foi possível verificar o documento. Tente novamente.");
    if (existingDoc) throw new Error("Já existe um parceiro cadastrado com este documento.");

    // Create auth user (confirmed)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { user_type: "partner", full_name: data.nome, phone: data.telefone },
    });
    if (createErr || !created.user) {
      if (/already|registered|exists/i.test(createErr?.message || "")) {
        throw new Error("Este e-mail já possui conta. Entre com outro e-mail ou use 'Esqueci minha senha'.");
      }
      throw new Error(createErr?.message || "Não foi possível criar a conta.");
    }
    const userId = created.user.id;

    // Unique slug
    let base = slugify(data.nome_loja);
    let slug = base;
    for (let i = 0; i < 50; i++) {
      const { data: ex } = await admin.from("partners").select("id").eq("slug", slug).maybeSingle();
      if (!ex) break;
      slug = `${base}-${Math.floor(Math.random() * 9999)}`;
    }

    const { error: insErr } = await admin.from("partners").insert({
      user_id: userId,
      tipo: data.tipo,
      nome: data.nome,
      documento: doc,
      email,
      telefone: data.telefone,
      endereco: data.endereco,
      nome_loja: data.nome_loja,
      slug,
      logo_url: data.logo_url || null,
      banner_url: data.banner_url || null,
      descricao: data.descricao || null,
      status: "pending",
    });
    if (insErr) {
      await admin.auth.admin.deleteUser(userId);
      console.error("[partners] registration insert failed:", insErr.message);
      throw new Error("Não foi possível salvar o cadastro da loja. Tente novamente.");
    }

    return { ok: true, slug };
  });

export const getMyPartner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("partners").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return { partner: data ?? null };
  });

export const adminListPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["pending","approved","rejected","suspended","all"]).optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    let q: any = db.from("partners").select("*").order("created_at", { ascending: false });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { partners: rows ?? [] };
  });

export const adminSetPartnerBadges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      verified: z.boolean().optional(),
      reliable_shipping: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const admin = await getAdminDb(context);
    const patch: any = {};
    if (data.verified !== undefined) patch.verified = data.verified;
    if (data.reliable_shipping !== undefined) patch.reliable_shipping = data.reliable_shipping;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await admin.from("partners").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetPartnerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending","approved","rejected","suspended"]),
      rejection_reason: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const admin = await getAdminDb(context);

    const { data: partner, error: pErr } = await admin
      .from("partners").select("user_id, status").eq("id", data.id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!partner) throw new Error("Parceiro não encontrado.");

    const patch: any = {
      status: data.status,
      rejection_reason: data.status === "rejected" ? (data.rejection_reason || null) : null,
    };
    if (data.status === "approved") patch.approved_at = new Date().toISOString();

    const { error: upErr } = await admin.from("partners").update(patch).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    if (data.status === "approved") {
      const { error: roleError } = await admin.from("user_roles").upsert(
        { user_id: partner.user_id, role: "partner" },
        { onConflict: "user_id,role" },
      );
      if (roleError) console.warn("[partners] partner role sync skipped:", roleError.message);
    } else {
      const { error: roleError } = await admin.from("user_roles").delete()
        .eq("user_id", partner.user_id).eq("role", "partner");
      if (roleError) console.warn("[partners] partner role sync skipped:", roleError.message);
    }
    return { ok: true };
  });
// ===== Self-activation (no admin approval, no new account) =====
export const activatePartnerSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;

    const { data: rpcRows, error: rpcError } = await supabase.rpc("activate_partner_self");
    if (!rpcError) {
      const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
      return { ok: true, slug: row?.slug ?? null, created: Boolean(row?.created) };
    }

    // Already have a partner row? Just ensure approved.
    const { data: existing, error: existingError } = await supabase
      .from("partners").select("id, status, slug").eq("user_id", userId).maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existing) {
      if (existing.status !== "approved") {
        const { error: updateError } = await supabase.from("partners").update({
          status: "approved",
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        }).eq("id", existing.id);
        if (updateError) throw new Error(updateError.message);
      }
      return { ok: true, slug: existing.slug, created: false };
    }

    // Get user info from auth claims (avoids needing service role)
    const claims = (context as any).claims ?? {};
    const meta = (claims.user_metadata ?? {}) as any;
    const email = claims.email || `${userId}@grupogf.local`;
    const nome = meta.full_name || meta.name || String(email).split("@")[0] || "Parceiro GF";
    const telefone = meta.phone || "";
    const lojaBase = `Loja ${nome}`.slice(0, 120);

    // Unique slug
    let base = slugify(lojaBase);
    let slug = base;
    for (let i = 0; i < 50; i++) {
      const { data: ex } = await supabase.from("partners").select("id").eq("slug", slug).maybeSingle();
      if (!ex) break;
      slug = `${base}-${Math.floor(Math.random() * 99999)}`;
    }

    // Synthetic unique documento placeholder (user can edit later in painel)
    const docPlaceholder = `pending-${userId.replace(/-/g, "").slice(0, 14)}`;

    const { error: insErr } = await supabase.from("partners").insert({
      user_id: userId,
      tipo: "PF",
      nome,
      documento: docPlaceholder,
      email,
      telefone,
      endereco: {},
      nome_loja: lojaBase,
      slug,
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    if (insErr) {
      console.warn("[partners] self activation fallback blocked:", insErr.message);
      return {
        ok: false,
        slug: null,
        created: false,
        error: "Atualizei as permissões de parceiro. Tente novamente em alguns segundos.",
      };
    }

    return { ok: true, slug, created: true };
  });
