// @ts-nocheck
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StoreStateRow = {
  products: any[];
  banners: any[];
  coupons: any[];
  settings: Record<string, any>;
};

const STORE_ID = "singleton";

// Module-level cache so state is preserved across route navigations (e.g. when
// the user presses the browser Back button and the home route re-mounts).
let cachedStoreState: StoreStateRow | null = null;

export function useStoreState(initial: StoreStateRow) {
  const [state, setState] = useState<StoreStateRow>(() => cachedStoreState ?? initial);
  const [ready, setReady] = useState<boolean>(cachedStoreState !== null);



  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("store_state")
        .select("products,banners,coupons,settings")
        .eq("id", STORE_ID)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        const next: StoreStateRow = {
          products: (data.products as any[]) ?? [],
          banners: (data.banners as any[]) ?? [],
          coupons: (data.coupons as any[]) ?? [],
          settings: (data.settings as Record<string, any>) ?? {},
        };
        // Seed empty arrays with defaults from initial so first-load isn't blank
        if (next.products.length === 0) next.products = initial.products;
        if (next.banners.length === 0) next.banners = initial.banners;
        if (next.coupons.length === 0) next.coupons = initial.coupons;
        if (Object.keys(next.settings).length === 0) next.settings = initial.settings;
        cachedStoreState = next;
        setState(next);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("store_state_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "store_state", filter: `id=eq.${STORE_ID}` },
        (payload: any) => {
          const r = payload.new;
          const next: StoreStateRow = {
            products: (r.products as any[]) ?? [],
            banners: (r.banners as any[]) ?? [],
            coupons: (r.coupons as any[]) ?? [],
            settings: (r.settings as Record<string, any>) ?? {},
          };
          cachedStoreState = next;
          setState(next);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const mutate = useCallback(async (patch: Partial<StoreStateRow>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      cachedStoreState = next;
      return next;
    });
    const { error } = await supabase
      .from("store_state")
      .upsert({ id: STORE_ID, ...patch }, { onConflict: "id" });
    if (error) console.error("[store_state]", error.message);
  }, []);

  return { state, setState, ready, mutate };
}