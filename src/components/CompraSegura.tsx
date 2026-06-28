import { Link } from "@tanstack/react-router";
import { ShieldCheck, CreditCard, Headphones, RotateCcw, ChevronRight } from "lucide-react";

/** Selo compacto exibido nos cards de produto */
export function CompraSeguraTag() {
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
      <ShieldCheck size={10} /> Compra Segura GF
    </span>
  );
}

/** Bloco completo do selo, exibido na página/modal do produto */
export function CompraSeguraSeal() {
  const items = [
    { icon: ShieldCheck, label: "Compra Segura GF" },
    { icon: CreditCard, label: "Pagamento Protegido" },
    { icon: Headphones, label: "Suporte ao Cliente" },
    { icon: RotateCcw, label: "Reembolso em Casos Elegíveis" },
  ];
  return (
    <div className="mt-4 bg-emerald-500/[0.07] border border-emerald-500/25 rounded-xl p-3.5">
      <div className="grid grid-cols-2 gap-2">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Icon size={12} className="text-emerald-300" />
            </span>
            <span className="text-[11px] font-medium text-emerald-200 leading-tight">✅ {label}</span>
          </div>
        ))}
      </div>
      <Link to="/compra-segura"
        className="mt-2.5 flex items-center justify-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 transition font-semibold">
        Conheça as regras de proteção ao comprador <ChevronRight size={12} />
      </Link>
    </div>
  );
}
