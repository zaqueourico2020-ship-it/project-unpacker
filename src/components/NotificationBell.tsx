import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    const { data } = await (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(15);
    setItems((data as Notif[]) ?? []);
  }, []);

  useEffect(() => {
    let channel: any;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      setUserId(uid);
      await load(uid);
      if (cancelled) return;
      const ch = (supabase as any).channel(`notifs-${uid}-${Math.random().toString(36).slice(2)}`);
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        () => load(uid),
      );
      ch.subscribe();
      channel = ch;
    })();
    return () => {
      cancelled = true;
      if (channel) (supabase as any).removeChannel(channel);
    };
  }, [load]);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!userId) return;
    await (supabase as any).from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-accent"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm font-semibold">
              Notificações
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs font-normal text-primary hover:underline">
                  Marcar todas como lidas
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma notificação ainda.</div>
              ) : (
                items.map((n) => {
                  const content = (
                    <div className={`flex flex-col gap-1 border-b border-border px-3 py-2 text-sm hover:bg-accent ${!n.read ? "bg-accent/40" : ""}`}>
                      <div className="font-medium">{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                      <div className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} to={n.link as any} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  ) : (
                    <div key={n.id}>{content}</div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
