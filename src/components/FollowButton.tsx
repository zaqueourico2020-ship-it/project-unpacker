import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, HeartOff } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  followStore,
  unfollowStore,
  isFollowingStore,
  getStoreFollowInfo,
} from "@/lib/followers.functions";

type Props = {
  sellerId: string;
  className?: string;
  compact?: boolean;
};

export function FollowButton({ sellerId, className, compact }: Props) {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  const countFn = useServerFn(getStoreFollowInfo);
  const followingFn = useServerFn(isFollowingStore);
  const followFn = useServerFn(followStore);
  const unfollowFn = useServerFn(unfollowStore);

  const { data: info } = useQuery({
    queryKey: ["follow-count", sellerId],
    queryFn: () => countFn({ data: { sellerId } }),
  });
  const { data: state } = useQuery({
    queryKey: ["is-following", sellerId, authed],
    queryFn: () => followingFn({ data: { sellerId } }),
    enabled: authed,
  });

  const isFollowing = !!state?.following;

  const mut = useMutation({
    mutationFn: async () => {
      if (!authed) {
        window.location.href = "/auth?redirect=" + encodeURIComponent(window.location.pathname);
        return;
      }
      if (isFollowing) await unfollowFn({ data: { sellerId } });
      else await followFn({ data: { sellerId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follow-count", sellerId] });
      qc.invalidateQueries({ queryKey: ["is-following", sellerId] });
      qc.invalidateQueries({ queryKey: ["followed-stores"] });
    },
  });

  const count = info?.count ?? 0;
  const label = isFollowing ? "Seguindo" : "Seguir Loja";
  const Icon = isFollowing ? HeartOff : Heart;

  if (compact) {
    return (
      <button
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className={
          className ??
          `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            isFollowing
              ? "bg-pink-500/15 text-pink-300 ring-1 ring-pink-400/40 hover:bg-pink-500/25"
              : "bg-pink-500 text-white hover:bg-pink-600"
          }`
        }
      >
        <Icon className="h-3.5 w-3.5" /> {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className={
          className ??
          `flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
            isFollowing
              ? "bg-pink-500/15 text-pink-300 ring-1 ring-pink-400/40 hover:bg-pink-500/25"
              : "bg-pink-500 text-white hover:bg-pink-600"
          }`
        }
      >
        <Icon className="h-4 w-4" />
        {mut.isPending ? "..." : label}
      </button>
      <div className="rounded-md bg-white/5 px-2.5 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10">
        👥 {count.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}
