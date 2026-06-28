import { createFileRoute } from "@tanstack/react-router";
import { SellerChat } from "@/components/SellerChat";

export const Route = createFileRoute("/_authenticated/admin/chat")({
  head: () => ({ meta: [{ title: "Chat — Admin Grupo GF" }, { name: "robots", content: "noindex" }] }),
  component: AdminChatPage,
});

function AdminChatPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">💬 Chat com clientes</h1>
      <SellerChat />
    </div>
  );
}
