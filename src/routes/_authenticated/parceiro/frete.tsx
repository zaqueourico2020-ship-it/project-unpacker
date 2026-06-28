import { createFileRoute } from "@tanstack/react-router";
import { Truck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parceiro/frete")({
  component: FretePage,
});

function FretePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Frete</h1>
      <p className="text-sm text-muted-foreground">Configure as regras de envio da sua loja.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { t: "Frete grátis", d: "Liberar frete grátis acima de um valor." },
          { t: "Frete fixo", d: "Cobrar valor único independente da região." },
          { t: "Frete por CEP", d: "Tabela de preços por faixa de CEP." },
          { t: "Entrega local", d: "Entregar com sua própria equipe em raio definido." },
          { t: "Retirada na loja", d: "Cliente retira no endereço da loja." },
        ].map((o) => (
          <div key={o.t} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4" /> {o.t}</div>
            <p className="mt-1 text-sm text-muted-foreground">{o.d}</p>
            <button className="mt-3 rounded border border-border px-3 py-1 text-xs text-muted-foreground" disabled>
              Configurar (em breve)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
