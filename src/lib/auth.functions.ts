import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SignupInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(6).max(72),
  userType: z.enum(["lojista", "pessoa_fisica"]),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(30).refine((value) => value.replace(/\D/g, "").length >= 10, "Telefone inválido"),
  cnpj: z.string().max(30).optional().nullable(),
  referralCode: z.string().trim().max(20).optional().nullable(),
});

export const signUpAndConfirm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SignupInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: createdUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        user_type: data.userType,
        full_name: data.fullName,
        phone: data.phone,
        cnpj: data.userType === "lojista" ? data.cnpj ?? null : null,
        referral_code: data.referralCode ? data.referralCode.trim().toUpperCase() : null,
      },
    });

    if (error) {
      if (/already|registered|exists/i.test(error.message || "")) {
        throw new Error("Este email já tem conta. Faça login ou use 'Esqueci minha senha'.");
      }
      throw new Error(error.message || "Não foi possível criar sua conta.");
    }

    if (!createdUser.user) {
      throw new Error("Não foi possível criar sua conta.");
    }

    return { ok: true };
  });

const ConfirmInputSchema = z.object({
  email: z.string().email().max(255),
});

export const confirmEmailByAddress = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ConfirmInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Confirma o e-mail diretamente via Admin API (substitui RPC anterior em auth.users).
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);
    const user = list.users.find((u: { email?: string | null }) => (u.email || "").toLowerCase() === data.email.toLowerCase());
    if (!user) return { ok: true };
    if (!user.email_confirmed_at) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: true });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
