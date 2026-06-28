import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Link2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parceiro/asaas")({
  component: AsaasPage,
});

function AsaasPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Conta Asaas</h1>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold"><Banknote className="h-4 w-4" /> Receber pagamentos</div>
        <p className="text-sm text-muted-foreground">
          Conecte sua conta Asaas para habilitar recebimentos com Split Automático.
          A cada venda, a plataforma retém <strong>12% (Grupo GF)</strong> e repassa <strong>88% (você)</strong> direto na sua conta Asaas.
        </p>
        <button disabled className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground opacity-60">
          <Link2 className="h-4 w-4" /> Conectar conta Asaas (em breve)
        </button>
        <p className="text-xs text-muted-foreground">
          Esta etapa requer cadastrar a chave de API do Asaas no servidor. Solicite ao administrador para liberar a integração.
        </p>
      </div>
    </div>
  );
}
