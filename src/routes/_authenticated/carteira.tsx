// @ts-nocheck
import { createFileRoute, useRouter, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getWallet, listTransactions, requestPixDeposit, requestPixWithdraw,
  transferToUser, updatePixKey,
} from "@/lib/wallet.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, FileText,
  Eye, Bell, Menu, ShieldCheck, ChevronRight, Calendar,
  ArrowDown, ArrowUp, ShoppingCart, Gift,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/carteira")({
  head: () => ({
    meta: [
      { title: "Carteira GF" },
      { name: "description", content: "Sua Carteira GF: saldo, PIX, cashback e extrato." },
    ],
  }),
  component: CarteiraPage,
});

const BRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const splitBRL = (n: number) => {
  const [int, dec] = BRL(n).replace("R$", "").trim().split(",");
  return { int: "R$ " + int, dec };
};

type Modal = null | "deposit" | "withdraw" | "transfer";

function CarteiraPage() {
  const router = useRouter();
  const nav = useNavigate();
  const fetchWallet = useServerFn(getWallet);
  const fetchTx = useServerFn(listTransactions);

  const wq = useQuery({ queryKey: ["wallet"], queryFn: () => fetchWallet() });
  const tq = useQuery({ queryKey: ["wallet-tx"], queryFn: () => fetchTx() });

  const [modal, setModal] = useState<Modal>(null);
  const [showBalance, setShowBalance] = useState(true);

  const wallet = wq.data?.wallet;
  const profile = wq.data?.profile;
  const tx = tq.data?.transactions ?? [];

  const available = Number(wallet?.available_balance ?? 0);
  const pending = Number(wallet?.pending_balance ?? 0);
  const cashback = Number(wallet?.total_cashback ?? 0);
  const blocked = Number((wallet as any)?.blocked_balance ?? 0);
  const total = available + pending + cashback;

  const reload = () => { wq.refetch(); tq.refetch(); router.invalidate(); };

  const a = splitBRL(available);

  return (
    <div className="min-h-screen bg-[#0a1628] text-white pb-24">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button onClick={() => nav({ to: "/" })} className="p-1.5 -ml-1.5">
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold flex-1">Carteira GF</h1>
        <button className="relative p-1.5">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400" />
        </button>
        <div className="w-9 h-9 rounded-full overflow-hidden border border-cyan-500/30">
          <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile?.full_name ?? "GF")}&backgroundColor=06b6d4`} className="w-full h-full" alt="" />
        </div>
      </div>

      {/* Hero saldo */}
      <div className="px-4">
        <div className="rounded-2xl p-4 border border-cyan-400/40 bg-gradient-to-br from-[#0c2340] via-[#0f1d32] to-[#0a1628] shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-slate-300 text-sm">
                Saldo disponível
                <button onClick={() => setShowBalance(s => !s)}><Eye size={14} /></button>
              </div>
              <div className="mt-1 flex items-end gap-0.5">
                <span className="text-4xl font-bold tracking-tight">
                  {showBalance ? a.int : "R$ ••••"}
                </span>
                {showBalance && <span className="text-xl font-bold opacity-80 mb-1">,{a.dec}</span>}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                <ShieldCheck size={14} />
                Rendimento de 105% do CDI <ChevronRight size={12} />
              </div>
            </div>
            <button className="rounded-full bg-cyan-500/15 border border-cyan-400/30 px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm rotate-45 bg-cyan-400 inline-block" />
              Seu Pix
            </button>
          </div>

          <div className="border-t border-cyan-500/15 mt-4 pt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[11px] text-slate-400">Pendente</div>
              <div className="font-bold text-orange-400">{BRL(pending)}</div>
              <div className="text-[10px] text-slate-500">A liberar</div>
            </div>
            <div className="border-x border-cyan-500/10">
              <div className="text-[11px] text-slate-400">Cashback</div>
              <div className="font-bold text-emerald-400">{BRL(cashback)}</div>
              <div className="text-[10px] text-slate-500">Disponível</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Total</div>
              <div className="font-bold text-cyan-400">{BRL(total)}</div>
              <div className="text-[10px] text-slate-500">Somatório geral</div>
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="px-4 mt-4 grid grid-cols-4 gap-2">
        {[
          { icon: ArrowDownToLine, label: "Depositar", sub: "via PIX", color: "#10b981", bg: "rgba(16,185,129,0.15)", action: () => setModal("deposit") },
          { icon: ArrowUpFromLine, label: "Sacar", sub: "via PIX", color: "#f43f5e", bg: "rgba(244,63,94,0.15)", action: () => setModal("withdraw") },
          { icon: ArrowLeftRight, label: "Transferir", sub: "via PIX", color: "#3b82f6", bg: "rgba(59,130,246,0.15)", action: () => setModal("transfer") },
          { icon: FileText, label: "Extrato", sub: "ver lançamentos", color: "#a855f7", bg: "rgba(168,85,247,0.15)", action: () => document.getElementById("extrato")?.scrollIntoView({ behavior: "smooth" }) },
        ].map((b) => (
          <button key={b.label} onClick={b.action}
            className="rounded-xl p-3 bg-[#0f1d32] border border-cyan-500/10 flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: b.bg }}>
              <b.icon size={20} style={{ color: b.color }} />
            </div>
            <div className="text-xs font-bold">{b.label}</div>
            <div className="text-[10px] text-slate-400">{b.sub}</div>
          </button>
        ))}
      </div>

      {/* Saldo a receber */}
      {pending > 0 && (
        <div className="px-4 mt-4">
          <div className="rounded-xl p-3.5 bg-[#0f1d32] border border-cyan-500/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
              <Calendar size={18} className="text-cyan-400" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Saldo a receber de vendas</div>
              <div className="text-xs text-slate-400">{BRL(pending)} a liberar em breve</div>
            </div>
            <ChevronRight size={18} className="text-slate-500" />
          </div>
        </div>
      )}

      {blocked > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-xl p-3.5 bg-red-500/5 border border-red-500/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center">
              <ShieldCheck size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm text-red-300">Saldo bloqueado</div>
              <div className="text-xs text-slate-400">{BRL(blocked)} indisponível para saque (disputa/estorno)</div>
            </div>
          </div>
        </div>
      )}

      {/* Últimas movimentações */}
      <div id="extrato" className="px-4 mt-4">
        <div className="rounded-2xl bg-[#0f1d32] border border-cyan-500/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">Últimas movimentações</h3>
            <Link to="/wallet/transactions" className="text-xs text-cyan-400 font-semibold">Ver todas</Link>
          </div>
          {tq.isLoading && <div className="text-sm text-slate-400 py-4 text-center">Carregando...</div>}
          {!tq.isLoading && !tx.length && (
            <div className="text-sm text-slate-400 py-6 text-center">Sem movimentações ainda.</div>
          )}
          <div className="divide-y divide-cyan-500/10">
            {tx.slice(0, 6).map((t: any) => {
              const positive = Number(t.amount) >= 0;
              const meta = txMeta(t.type, positive);
              return (
                <div key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center border-2"
                    style={{ borderColor: meta.color, background: meta.bg }}>
                    <meta.icon size={16} style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{meta.label}</div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(t.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>
                    {positive ? "+ " : "- "}{BRL(Math.abs(Number(t.amount)))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="px-4 mt-4">
        <div className="rounded-2xl bg-[#0f1d32] border border-cyan-500/10 p-4">
          <h3 className="font-bold mb-3">Resumo da sua carteira</h3>
          <div className="grid grid-cols-2 gap-2">
            <SummaryCard label="Saldo disponível" value={BRL(available)} accent="#22d3ee" />
            <SummaryCard label="A liberar (pendente)" value={BRL(pending)} accent="#fb923c" />
            <SummaryCard label="Cashback acumulado" value={BRL(cashback)} accent="#10b981" />
            <SummaryCard label="Total geral" value={BRL(total)} accent="#3b82f6" />
          </div>
        </div>
      </div>

      {/* Modais */}
      <Dialog open={modal === "deposit"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="bg-[#0f1d32] border-cyan-500/20 text-white max-w-md">
          <DialogHeader><DialogTitle>Depositar via PIX</DialogTitle></DialogHeader>
          <DepositForm onDone={() => { reload(); }} />
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "withdraw"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="bg-[#0f1d32] border-cyan-500/20 text-white max-w-md">
          <DialogHeader><DialogTitle>Sacar via PIX</DialogTitle></DialogHeader>
          <WithdrawForm pixKey={profile?.pix_key ?? ""} max={available} onDone={() => { reload(); setModal(null); }} />
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "transfer"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="bg-[#0f1d32] border-cyan-500/20 text-white max-w-md">
          <DialogHeader><DialogTitle>Transferir saldo</DialogTitle></DialogHeader>
          <TransferForm onDone={() => { reload(); setModal(null); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-[#0a1628] border border-cyan-500/10 p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="font-bold text-lg mt-0.5" style={{ color: accent }}>{value}</div>
      <div className="mt-2 h-6 rounded-md opacity-50"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}33)` }} />
    </div>
  );
}

function txMeta(type: string, positive: boolean) {
  const map: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    pix_deposit: { label: "Pix recebido", icon: ArrowDown, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    transfer_in: { label: "Transferência recebida", icon: ArrowDown, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    sale_received: { label: "Venda recebida", icon: ArrowDown, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    pix_withdraw: { label: "Saque PIX", icon: ArrowUp, color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
    transfer_out: { label: "Transferência enviada", icon: ArrowUp, color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
    purchase: { label: "Pagamento", icon: ShoppingCart, color: "#fb923c", bg: "rgba(251,146,60,0.1)" },
    cashback: { label: "Cashback recebido", icon: Gift, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    gf_commission: { label: "Comissão GF", icon: ArrowUp, color: "#a855f7", bg: "rgba(168,85,247,0.1)" },
    release: { label: "Liberação semanal", icon: ArrowDown, color: "#10b981", bg: "rgba(16,185,129,0.1)" },
    birthday_bonus: { label: "Bônus de aniversário", icon: Gift, color: "#ec4899", bg: "rgba(236,72,153,0.1)" },
    adjustment: { label: "Ajuste", icon: FileText, color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  };
  return map[type] ?? { label: type, icon: FileText, color: positive ? "#10b981" : "#f43f5e", bg: "rgba(148,163,184,0.1)" };
}

function DepositForm({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(requestPixDeposit);
  const [amount, setAmount] = useState("");
  const [qr, setQr] = useState<{ qr_code_base64: string | null; copy_paste: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const v = Number(amount.replace(",", "."));
    if (!v || v <= 0) return toast.error("Informe um valor válido");
    setLoading(true);
    try {
      const r = await fn({ data: { amount: v } });
      setQr({ qr_code_base64: r.qr_code_base64, copy_paste: r.copy_paste });
      toast.success("PIX gerado!");
      onDone();
    } catch (e: any) { toast.error(e.message ?? "Erro"); }
    finally { setLoading(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="R$ 100,00" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="bg-[#0a1628] border-cyan-500/20" />
        <Button onClick={submit} disabled={loading}>{loading ? "..." : "Gerar"}</Button>
      </div>
      {qr?.qr_code_base64 && (
        <div className="text-center space-y-2">
          <img src={`data:image/png;base64,${qr.qr_code_base64}`} alt="QR" className="mx-auto size-48 rounded-lg bg-white p-2" />
          {qr.copy_paste && (
            <div className="flex gap-2">
              <Input readOnly value={qr.copy_paste} className="bg-[#0a1628] border-cyan-500/20 text-xs" />
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(qr.copy_paste!); toast.success("Copiado!"); }}>Copiar</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WithdrawForm({ pixKey, max, onDone }: { pixKey: string; max: number; onDone: () => void }) {
  const fn = useServerFn(requestPixWithdraw);
  const savePix = useServerFn(updatePixKey);
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState(pixKey);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const v = Number(amount.replace(",", "."));
    if (!v) return toast.error("Valor inválido");
    if (!key.trim()) return toast.error("Informe a chave PIX");
    setLoading(true);
    try {
      if (key !== pixKey) await savePix({ data: { pix_key: key.trim() } });
      await fn({ data: { amount: v, pix_key: key.trim() } });
      toast.success("Saque solicitado!");
      onDone();
    } catch (e: any) { toast.error(e.message ?? "Erro"); }
    finally { setLoading(false); }
  };
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">Disponível: {BRL(max)}</div>
      <div><Label>Chave PIX</Label><Input value={key} onChange={(e) => setKey(e.target.value)} className="bg-[#0a1628] border-cyan-500/20" /></div>
      <div><Label>Valor</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-[#0a1628] border-cyan-500/20" /></div>
      <Button onClick={submit} disabled={loading} className="w-full">{loading ? "..." : "Solicitar saque"}</Button>
    </div>
  );
}

function TransferForm({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(transferToUser);
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const v = Number(amount.replace(",", "."));
    if (!email || !v) return toast.error("Preencha destinatário e valor");
    setLoading(true);
    try {
      await fn({ data: { to_email: email.trim(), amount: v, note: note || undefined } });
      toast.success("Transferência realizada!");
      onDone();
    } catch (e: any) { toast.error(e.message ?? "Erro"); }
    finally { setLoading(false); }
  };
  return (
    <div className="space-y-3">
      <div><Label>E-mail destinatário</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-[#0a1628] border-cyan-500/20" /></div>
      <div><Label>Valor</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-[#0a1628] border-cyan-500/20" /></div>
      <div><Label>Mensagem</Label><Input value={note} onChange={(e) => setNote(e.target.value)} className="bg-[#0a1628] border-cyan-500/20" /></div>
      <Button onClick={submit} disabled={loading} className="w-full">{loading ? "..." : "Transferir"}</Button>
    </div>
  );
}