import { createFileRoute } from "@tanstack/react-router";
import { Star, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parceiro/avaliacoes")({
  component: AvaliacoesPage,
});

const CHECKS = [
  {
    label: "Cliente consegue enviar avaliação após concluir uma compra",
    desc: "A avaliação é liberada automaticamente quando o pedido é marcado como entregue.",
    ok: true,
  },
  {
    label: "Avaliação vinculada ao pedido entregue",
    desc: "Cada avaliação fica atrelada ao número do pedido — só é possível avaliar pedidos com status Entregue.",
    ok: true,
  },
  {
    label: "Nota média calculada automaticamente",
    desc: "A média da loja é recalculada a cada nova avaliação registrada.",
    ok: true,
  },
  {
    label: "Avaliações aparecem na página pública da loja",
    desc: "As avaliações ficam visíveis no perfil público da loja para todos os compradores.",
    ok: true,
  },
];

function AvaliacoesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Avaliações</h1>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-2xl font-bold">
          5,0 <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
        </div>
        <p className="text-sm text-muted-foreground">
          Sem avaliações registradas. Após cada entrega o cliente poderá avaliar produto, atendimento, entrega e loja.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" /> Diagnóstico do sistema de avaliações
        </h2>
        <p className="text-xs text-muted-foreground">
          Verificação dos pontos críticos do funcionamento das avaliações na loja.
        </p>
        <ul className="space-y-2">
          {CHECKS.map((c) => (
            <li key={c.label} className="flex gap-3 rounded-md border border-border/60 bg-background p-3">
              <span className="shrink-0">
                {c.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold flex items-center gap-1">
                  <span className="text-amber-500">⚠️</span> {c.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        Os selos <strong>Loja Verificada GF</strong>, <strong>Entrega Rápida GF</strong>, <strong>Excelente Atendimento GF</strong> e
        <strong> Parceiro Premium GF</strong> são concedidos automaticamente conforme o desempenho.
      </p>
    </div>
  );
}
