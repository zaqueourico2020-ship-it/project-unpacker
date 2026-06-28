import { createFileRoute } from "@tanstack/react-router";
import { SellerChat } from "@/components/SellerChat";

export const Route = createFileRoute("/_authenticated/parceiro/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — Painel do Parceiro" }, { name: "robots", content: "noindex" }] }),
  component: PartnerChatPage,
});

function PartnerChatPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">💬 Mensagens dos clientes</h1>
      <SellerChat />
    </div>
  );
}
