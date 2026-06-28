import { useState } from "react";
import { Check, Copy, ChevronDown, ChevronUp, Truck, XCircle } from "lucide-react";

export const TRACK_STEPS = [
  { key: "received", label: "Pedido Recebido" },
  { key: "payment", label: "Pagamento Aprovado" },
  { key: "preparing", label: "Preparando Envio" },
  { key: "transit", label: "Em Transporte" },
  { key: "out", label: "Saiu para Entrega" },
  { key: "delivered", label: "Entregue" },
] as const;

/** Map dos status do pedido (Supabase) para o passo da linha do tempo */
export const STATUS_TO_STEP: Record<string, number> = {
  pending: 0,
  approved: 1,
  preparing: 2,
  shipped: 3,
  out_for_delivery: 4,
  delivered: 5,
};

/** Gera um código de rastreio determinístico a partir do id do pedido */
export function trackingCodeFromId(id: string): string {
  let h1 = 0, h2 = 7;
  for (let i = 0; i < id.length; i++) {
    h1 = (h1 * 31 + id.charCodeAt(i)) >>> 0;
    h2 = (h2 * 17 + id.charCodeAt(i) * 13) >>> 0;
  }
  const digits = (String(h1).padStart(10, "0") + String(h2).padStart(10, "0")).slice(0, 11);
  return `GF${digits}BR`;
}

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null;
  // já formatado pt-BR (pedido local)
  if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) return d;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function OrderTrackingTimeline({ step, dates, trackingCode, cancelled, onCopied }: {
  /** índice do passo atual (0-5) */
  step: number;
  /** data de cada passo (ISO ou pt-BR); null = ainda não ocorreu */
  dates: (string | null)[];
  trackingCode: string;
  cancelled?: boolean;
  onCopied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const pct = cancelled ? 0 : Math.round((step / (TRACK_STEPS.length - 1)) * 100);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopied?.();
    } catch { /* ignore */ }
  };

  return (
    <div className="mt-3 pt-3 border-t border-cyan-500/10">
      {cancelled ? (
        <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
          <XCircle size={14} /> Pedido cancelado
        </div>
      ) : (
        <>
          {/* Barra de progresso */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5">
              <Truck size={13} /> {TRACK_STEPS[Math.min(step, TRACK_STEPS.length - 1)].label}
            </span>
            <span className="text-[10px] text-slate-400">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#0f1d32] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(pct, 4)}%`, background: "linear-gradient(90deg,#06b6d4,#0a4fe3)" }} />
          </div>
        </>
      )}

      {/* Código de rastreio */}
      <div className="flex items-center justify-between mt-2.5 bg-[#0f1d32] border border-cyan-500/15 rounded-lg px-3 py-2">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Código de rastreio</p>
          <p className="text-xs font-mono font-semibold text-slate-200">{trackingCode}</p>
        </div>
        <button onClick={copy} aria-label="Copiar código de rastreio"
          className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      {/* Linha do tempo */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full mt-2 flex items-center justify-center gap-1 text-[11px] text-cyan-400 py-1 hover:text-cyan-300 transition">
        {open ? <>Ocultar rastreamento <ChevronUp size={13} /></> : <>Ver rastreamento completo <ChevronDown size={13} /></>}
      </button>
      {open && (
        <div className="mt-2 pl-1">
          {TRACK_STEPS.map((s, i) => {
            const done = !cancelled && i <= step;
            const isCurrent = !cancelled && i === step;
            const date = fmtDate(dates[i]);
            return (
              <div key={s.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                    done
                      ? "bg-cyan-500 border-cyan-400 text-[#0a1628]"
                      : "bg-[#0f1d32] border-slate-600 text-slate-600"
                  } ${isCurrent ? "ring-2 ring-cyan-400/40" : ""}`}>
                    {done ? <Check size={12} strokeWidth={3} /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />}
                  </div>
                  {i < TRACK_STEPS.length - 1 && (
                    <div className={`w-0.5 flex-1 min-h-[18px] ${i < step && !cancelled ? "bg-cyan-500/60" : "bg-slate-700"}`} />
                  )}
                </div>
                <div className="pb-3">
                  <p className={`text-xs font-semibold leading-5 ${done ? "text-slate-100" : "text-slate-500"}`}>{s.label}</p>
                  <p className="text-[10px] text-slate-500">
                    {date ?? (done ? "Concluído" : "Previsto")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
