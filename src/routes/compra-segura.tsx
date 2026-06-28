import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, CreditCard, Headphones, RotateCcw, ArrowLeft, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import logo from "@/assets/grupo-gf-logo.png";

export const Route = createFileRoute("/compra-segura")({
  head: () => ({
    meta: [
      { title: "Compra Segura GF — Proteção ao Comprador" },
      { name: "description", content: "Conheça as regras de proteção ao comprador do Grupo GF: pagamento protegido, suporte ao cliente e reembolso em casos elegíveis." },
      { property: "og:title", content: "Compra Segura GF — Proteção ao Comprador" },
      { property: "og:description", content: "Pagamento protegido, suporte dedicado e reembolso em casos elegíveis. Compre com confiança no Grupo GF." },
    ],
  }),
  component: CompraSeguraPage,
});

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Compra Segura GF",
    desc: "Todas as compras feitas no app do Grupo GF são acompanhadas do início ao fim. Seu pedido só é concluído quando você recebe o produto conforme anunciado.",
  },
  {
    icon: CreditCard,
    title: "Pagamento Protegido",
    desc: "Os pagamentos são processados pelo Mercado Pago (Pix, cartão ou boleto) em ambiente criptografado. Não armazenamos os dados do seu cartão.",
  },
  {
    icon: Headphones,
    title: "Suporte ao Cliente",
    desc: "Nossa equipe está disponível pelo WhatsApp para ajudar antes, durante e depois da compra — dúvidas, trocas, rastreamento e qualquer imprevisto.",
  },
  {
    icon: RotateCcw,
    title: "Reembolso em Casos Elegíveis",
    desc: "Se o produto não chegar, chegar com defeito ou for diferente do anunciado, você pode solicitar reembolso dentro do prazo de proteção.",
  },
];

const ELIGIBLE = [
  "Produto não entregue dentro do prazo informado",
  "Produto recebido com defeito ou avaria de transporte",
  "Produto significativamente diferente do anúncio",
  "Cobrança duplicada ou valor incorreto",
  "Pedido cancelado pela loja após o pagamento",
];

const NOT_ELIGIBLE = [
  "Arrependimento após o prazo legal de 7 dias (CDC, art. 49) para compras online",
  "Produto danificado por mau uso após a entrega",
  "Solicitações feitas fora do prazo de proteção (até 7 dias após a entrega)",
  "Compras realizadas fora do app/checkout oficial do Grupo GF",
];

const STEPS = [
  { n: "1", t: "Abra uma solicitação", d: "Entre em contato pelo WhatsApp informando o número do pedido e o motivo." },
  { n: "2", t: "Análise em até 48h úteis", d: "Nossa equipe analisa o caso e pode pedir fotos ou informações adicionais." },
  { n: "3", t: "Resolução", d: "Aprovada a solicitação, você escolhe entre reenvio do produto ou reembolso integral." },
  { n: "4", t: "Reembolso", d: "Pix em até 2 dias úteis; cartão de crédito conforme prazo da operadora (até 2 faturas)." },
];

function CompraSeguraPage() {
  return (
    <div className="min-h-screen text-slate-100 pb-16" style={{ background: "#0a1628" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-4 py-3 flex items-center gap-3 border-b border-cyan-500/10" style={{ background: "#0f1d32" }}>
        <Link to="/" aria-label="Voltar para a loja" className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition">
          <ArrowLeft size={20} />
        </Link>
        <img src={logo} alt="Grupo GF" className="h-8 w-auto" />
        <h1 className="font-bold text-base">Compra Segura GF</h1>
      </header>

      {/* Hero */}
      <section className="px-4 pt-8 pb-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-4">
          <ShieldCheck size={32} className="text-emerald-300" />
        </div>
        <h2 className="text-2xl font-extrabold">Proteção ao Comprador</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
          Compre com tranquilidade: todas as compras no Grupo GF Rede Varejista contam com o selo
          <span className="text-emerald-300 font-semibold"> Compra Segura GF</span>.
        </p>
      </section>

      {/* Pilares */}
      <section className="px-4 space-y-3 max-w-md mx-auto">
        {PILLARS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 flex gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-emerald-300" />
            </span>
            <div>
              <p className="font-bold text-sm">✅ {title}</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Casos elegíveis */}
      <section className="px-4 mt-8 max-w-md mx-auto">
        <h3 className="font-bold text-base flex items-center gap-2 mb-3">
          <CheckCircle2 size={18} className="text-emerald-400" /> Casos elegíveis para reembolso
        </h3>
        <div className="bg-[#162340] border border-emerald-500/15 rounded-xl p-4 space-y-2">
          {ELIGIBLE.map(item => (
            <p key={item} className="text-xs text-slate-300 flex gap-2">
              <span className="text-emerald-400 shrink-0">✓</span> {item}
            </p>
          ))}
        </div>
      </section>

      {/* Casos não elegíveis */}
      <section className="px-4 mt-6 max-w-md mx-auto">
        <h3 className="font-bold text-base flex items-center gap-2 mb-3">
          <AlertTriangle size={18} className="text-amber-400" /> Casos não cobertos
        </h3>
        <div className="bg-[#162340] border border-amber-500/15 rounded-xl p-4 space-y-2">
          {NOT_ELIGIBLE.map(item => (
            <p key={item} className="text-xs text-slate-300 flex gap-2">
              <span className="text-amber-400 shrink-0">✕</span> {item}
            </p>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="px-4 mt-8 max-w-md mx-auto">
        <h3 className="font-bold text-base flex items-center gap-2 mb-3">
          <Clock size={18} className="text-cyan-400" /> Como solicitar a proteção
        </h3>
        <div className="space-y-3">
          {STEPS.map(s => (
            <div key={s.n} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 flex gap-3">
              <span className="w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center shrink-0 text-white"
                style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
                {s.n}
              </span>
              <div>
                <p className="font-semibold text-sm">{s.t}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 mt-8 max-w-md mx-auto">
        <a href="https://wa.me/5542998722699?text=Olá!%20Preciso%20de%20ajuda%20com%20a%20Proteção%20ao%20Comprador."
          target="_blank" rel="noreferrer"
          className="block w-full text-center py-3 rounded-xl font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}>
          Falar com o Suporte no WhatsApp
        </a>
        <Link to="/" className="block w-full text-center py-3 mt-2 rounded-xl font-semibold border border-cyan-500/30 text-cyan-300">
          Voltar para a loja
        </Link>
      </section>
    </div>
  );
}
