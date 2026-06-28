import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setInstalled(standalone);

    const ua = window.navigator.userAgent || "";
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    if (isIOS) {
      setShowIOSHelp(true);
      return;
    }
    setShowIOSHelp(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm shadow-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90"
      >
        <Download size={16} /> Baixar app
      </button>

      {showIOSHelp && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => setShowIOSHelp(false)}>
          <div className="bg-[#0f1d32] text-slate-100 rounded-2xl max-w-sm w-full p-5 border border-cyan-500/20" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Instalar o app</h3>
            {isIOS ? (
              <ol className="text-sm space-y-2 list-decimal pl-5 text-slate-300">
                <li>Toque no botão <b>Compartilhar</b> do Safari (ícone de seta para cima).</li>
                <li>Escolha <b>Adicionar à Tela de Início</b>.</li>
                <li>Confirme em <b>Adicionar</b>.</li>
              </ol>
            ) : (
              <ol className="text-sm space-y-2 list-decimal pl-5 text-slate-300">
                <li>Abra o menu do navegador (⋮).</li>
                <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
                <li>Confirme a instalação.</li>
              </ol>
            )}
            <button onClick={() => setShowIOSHelp(false)} className="mt-4 w-full py-2 rounded-lg bg-cyan-500 text-white font-semibold">Entendi</button>
          </div>
        </div>
      )}
    </>
  );
}
