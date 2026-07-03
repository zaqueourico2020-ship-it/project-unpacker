// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getReferralOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [codeRes, refsRes, walletRes] = await Promise.all([
      supabase.from("referral_codes").select("code").eq("user_id", userId).maybeSingle(),
      supabase.from("referrals").select("*").eq("referrer_id", userId).order("created_at", { ascending: false }),
      supabase.from("wallets").select("available_balance,pending_balance,blocked_balance").eq("user_id", userId).maybeSingle(),
    ]);
    const referrals = refsRes.data ?? [];
    const totalRewarded = referrals
      .filter((r: any) => r.status === "rewarded")
      .reduce((s: number, r: any) => s + Number(r.reward_amount || 0), 0);
    return {
      code: codeRes.data?.code ?? null,
      wallet: walletRes.data ?? { available_balance: 0, pending_balance: 0, blocked_balance: 0 },
      referrals,
      stats: {
        total: referrals.length,
        pending: referrals.filter((r: any) => r.status === "signed_up").length,
        rewarded: referrals.filter((r: any) => r.status === "rewarded").length,
        totalRewarded,
      },
    };
  });

export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().trim().min(4).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("apply_referral_code", { _code: data.code });
    if (error) {
      const m = String(error.message || "");
      if (m.includes("invalid_code")) throw new Error("Código inválido");
      if (m.includes("self_referral")) throw new Error("Não é possível se autoindicar");
      if (m.includes("already_ordered")) throw new Error("Você já realizou pedidos; código não pode ser aplicado");
      throw new Error(error.message);
    }
    return { ok: true };
  });
