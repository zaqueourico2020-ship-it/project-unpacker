import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck, ArrowLeft, AlertTriangle, Clock, Banknote, RotateCcw,
  Truck, FileText, Lock, Package, CheckCircle2, CreditCard,
} from "lucide-react";
import logo from "@/assets/grupo-gf-logo.png";

export const Route = createFileRoute("/seguranca-garantia")({
  head: () => ({
    meta: [
      { title: "Segurança e Garantia GF — Proteção, Reembolso e Políticas" },
      { name: "description", content: "Como funciona a proteção ao comprador no Grupo GF: disputas, prazos de repasse, reembolso, entrega, termos de uso e privacidade." },
      { property: "og:title", content: "Segurança e Garantia GF" },
      { property: "og:description", content: "Tudo sobre proteção ao comprador, disputas, reembolso e políticas do Grupo GF." },
    ],
  }),
  component: SegurancaGarantiaPage,
});

const FLUXO = [
  { n: "1", t: "Cliente faz o pedido", d: "Escolhe o produto, informa o endereço e paga via Pix.", status: "🟡 Aguardando pagamento" },
  { n: "2", t: "Pagamento aprovado", d: "O sistema cria o pedido, envia ao painel do vendedor e marca o valor como saldo pendente.", status: "🔵 Pedido aprovado" },
  { n: "3", t: "Vendedor prepara o pedido", d: "O vendedor vê o produto, quantidade, endereço e dados do cliente.", status: "🟣 Em preparação" },
  { n: "4", t: "Vendedor envia o pedido", d: "Informa o código de rastreio (Correios/transportadora) ou entrega própria.", status: "🚚 Em transporte" },
  { n: "5", t: "Cliente acompanha", d: "Em 'Meus Pedidos': aprovado → em preparação → em transporte → entregue.", status: "" },
  { n: "6", t: "Entrega concluída", d: "O cliente confirma com '✅ Recebi meu pedido' ou o sistema confirma após alguns dias.", status: "🟢 Entregue" },
  { n: "7", t: "Liberação do dinheiro", d: "A comissão da GF é separada e o valor do vendedor vira saldo disponível para saque.", status: "" },
];

const POLICIES = [
  {
    icon: ShieldCheck,
    title: "Proteção ao comprador",
    body: "Toda compra feita no app conta com o selo Compra Segura GF. O pedido só é finalizado quando o cliente recebe o produto conforme anunciado. Em caso de problema, abra uma disputa em até 7 dias após a entrega.",
  },
  {
    icon: AlertTriangle,
    title: "Como abrir uma disputa",
    body: "Em 'Meus Pedidos', selecione o pedido e clique em 'Abrir disputa'. Descreva o motivo e envie fotos quando possível. Nossa equipe analisa em até 48h úteis e media a solução entre comprador e vendedor.",
  },
  {
    icon: Clock,
    title: "Prazo de repasse ao vendedor",
    body: "O valor da venda fica em saldo pendente até a confirmação da entrega. Após confirmada (manual ou automaticamente em até 7 dias do envio), o valor vira saldo disponível e o vendedor pode solicitar saque via Pix.",
  },
  {
    icon: RotateCcw,
    title: "Política de reembolso",
    body: "Reembolso integral em casos elegíveis: produto não entregue, defeituoso, diferente do anunciado ou com cobrança incorreta. Pix em até 2 dias úteis; cartão conforme prazo da operadora. Arrependimento dentro do prazo legal de 7 dias (CDC art. 49).",
  },
  {
    icon: Truck,
    title: "Política de entrega",
    body: "O prazo de entrega é informado no checkout pelo vendedor. Após o envio, o cliente recebe o código de rastreio. Atrasos superiores a 7 dias úteis sobre o prazo informado dão direito a abrir disputa por não entrega.",
  },
  {
    icon: FileText,
    title: "Termos de uso",
    body: "Ao usar o Grupo GF, você concorda em fornecer informações verdadeiras, não comercializar produtos proibidos por lei, respeitar direitos de terceiros e seguir as regras de conduta da plataforma. O descumprimento pode resultar em bloqueio da conta.",
  },
  {
    icon: Lock,
    title: "Política de privacidade",
    body: "Coletamos apenas os dados necessários para processar pedidos e prevenir fraudes (LGPD). Seus dados de pagamento são processados pelo Mercado Pago em ambiente criptografado e não são armazenados em nossos servidores. Você pode solicitar exclusão a qualquer momento.",
  },
];

function SegurancaGarantiaPage() {
  return (
    <div className="min-h-screen text-slate-100 pb-16" style={{ background: "#0a1628" }}>
      <header className="sticky top-0 z-50 px-4 py-3 flex items-center gap-3 border-b border-cyan-500/10" style={{ background: "#0f1d32" }}>
        <Link to="/" aria-label="Voltar para a loja" className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition">
          <ArrowLeft size={20} />
        </Link>
        <img src={logo} alt="Grupo GF" className="h-8 w-auto" />
        <h1 className="font-bold text-base">Segurança e Garantia GF</h1>
      </header>

      {/* Hero */}
      <section className="px-4 pt-8 pb-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-4">
          <ShieldCheck size={32} className="text-emerald-300" />
        </div>
        <h2 className="text-2xl font-extrabold">🚨 Página de Segurança e Garantia GF</h2>
        <p className="text-sm text-slate-400 mt-2">
          Tudo sobre proteção ao comprador, disputas, prazos de repasse, reembolso, entrega e políticas da plataforma.
        </p>
      </section>

      {/* Políticas */}
      <section className="px-4 space-y-3 max-w-md mx-auto">
        {POLICIES.map(({ icon: Icon, title, body }) => (
          <details key={title} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 group">
            <summary className="flex gap-3 cursor-pointer list-none">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                <Icon size={18} className="text-emerald-300" />
              </span>
              <div className="flex-1">
                <p className="font-bold text-sm">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5 group-open:hidden">Toque para abrir</p>
              </div>
            </summary>
            <p className="text-xs text-slate-300 mt-3 leading-relaxed">{body}</p>
          </details>
        ))}
      </section>

      {/* Fluxo de entrega */}
      <section className="px-4 mt-10 max-w-md mx-auto">
        <h3 className="font-bold text-base flex items-center gap-2 mb-3">
          <Package size={18} className="text-cyan-300" /> 📦 Fluxo de entrega
        </h3>
        <p className="text-xs text-slate-400 mb-4">Veja o caminho que cada pedido percorre — do checkout até a liberação do dinheiro para o vendedor.</p>
        <div className="space-y-3">
          {FLUXO.map((s) => (
            <div key={s.n} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 flex gap-3">
              <span className="w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center shrink-0 text-white"
                style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
                {s.n}
              </span>
              <div>
                <p className="font-semibold text-sm">{s.t}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.d}</p>
                {s.status && (
                  <p className="text-[11px] text-cyan-300 mt-1 font-medium">Status: {s.status}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Exemplo repasse */}
      <section className="px-4 mt-8 max-w-md mx-auto">
        <h3 className="font-bold text-base flex items-center gap-2 mb-3">
          <Banknote size={18} className="text-emerald-300" /> Exemplo de repasse
        </h3>
        <div className="bg-[#162340] border border-emerald-500/15 rounded-xl p-4 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-400">Produto vendido</span><span className="font-bold">R$ 100,00</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Taxa GF (12%)</span><span className="text-amber-300">− R$ 12,00</span></div>
          <div className="flex justify-between border-t border-cyan-500/10 pt-2 mt-2">
            <span className="text-slate-300">Vendedor recebe</span><span className="font-bold text-emerald-300">R$ 88,00</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">O Grupo GF retém R$ 12,00 referentes à comissão da plataforma.</p>
        </div>
      </section>

      {/* Dados liberados ao vendedor */}
      <section className="px-4 mt-8 max-w-md mx-auto">
        <h3 className="font-bold text-base flex items-center gap-2 mb-3">
          <CheckCircle2 size={18} className="text-emerald-400" /> Quando o pedido é aprovado
        </h3>
        <div className="bg-[#162340] border border-cyan-500/15 rounded-xl p-4 space-y-2 text-xs text-slate-300">
          <p className="text-slate-400">O vendedor recebe acesso a:</p>
          <p>📦 Número do pedido</p>
          <p>👤 Nome do cliente</p>
          <p>📱 Telefone (opcional)</p>
          <p>📍 Endereço completo: rua, número, complemento, bairro, cidade, estado e CEP</p>
          <p>📝 Observações da entrega</p>
        </div>
      </section>

      {/* CTAs */}
      <section className="px-4 mt-8 max-w-md mx-auto space-y-2">
        <Link to="/compra-segura" className="block w-full text-center py-3 rounded-xl font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
          <CreditCard className="inline h-4 w-4 mr-2" /> Ver detalhes de Compra Segura
        </Link>
        <a href="https://wa.me/5542998722699?text=Olá!%20Preciso%20de%20ajuda%20com%20segurança%20e%20garantia."
          target="_blank" rel="noreferrer"
          className="block w-full text-center py-3 rounded-xl font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}>
          Falar com o Suporte
        </a>
        <Link to="/" className="block w-full text-center py-3 rounded-xl font-semibold border border-cyan-500/30 text-cyan-300">
          Voltar para a loja
        </Link>
      </section>
    </div>
  );
}
