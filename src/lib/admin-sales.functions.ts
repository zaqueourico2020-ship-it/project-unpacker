import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdminAccess, getAdminDb } from "@/lib/admin-access";

const Range = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.string().optional(),
});

export const listSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Range.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);
    let q = db.from("orders").select("*").order("created_at", { ascending: false }).limit(2000);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { sales: rows ?? [] };
  });

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Range.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdminAccess(context);
    const db = await getAdminDb(context);

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const since = data.from ?? new Date(now.getTime() - 180 * 86400000).toISOString();
    const until = data.to ?? new Date(now.getTime() + 86400000).toISOString();

    const [{ data: paid }, { data: products }] = await Promise.all([
      db
        .from("orders")
        .select("id,total,cost_total,profit,discount,items,paid_at,created_at,status,customer_name,payment_method,payment_type")
        .eq("status", "approved")
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: false }),
      db.from("products").select("id,name,stock_quantity,cost_price,active"),
    ]);

    const sales = (paid ?? []) as any[];
    const prods = (products ?? []) as any[];

    const sumIn = (rows: any[], k: string) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);

    const todayRows = sales.filter((s) => new Date(s.created_at) >= new Date(startDay));
    const monthRows = sales.filter((s) => new Date(s.created_at) >= new Date(startMonth));

    const revenueToday = sumIn(todayRows, "total");
    const revenueMonth = sumIn(monthRows, "total");
    const costMonth = sumIn(monthRows, "cost_total");
    const profitGrossMonth = revenueMonth - costMonth;
    const profitNetMonth = sumIn(monthRows, "profit");
    const productsSoldMonth = monthRows.reduce(
      (s, r) => s + ((r.items ?? []) as any[]).reduce((a, i) => a + Number(i.qty || 0), 0),
      0,
    );
    const totalInvested = prods.reduce((s, p) => s + Number(p.stock_quantity || 0) * Number(p.cost_price || 0), 0);
    const stockUnits = prods.reduce((s, p) => s + Number(p.stock_quantity || 0), 0);

    // Vendas por dia (últimos 30d)
    const dayMap = new Map<string, { date: string; revenue: number; profit: number; count: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key, revenue: 0, profit: 0, count: 0 });
    }
    for (const r of sales) {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      const slot = dayMap.get(key);
      if (slot) {
        slot.revenue += Number(r.total || 0);
        slot.profit += Number(r.profit || 0);
        slot.count += 1;
      }
    }
    const salesByDay = Array.from(dayMap.values());

    // Vendas por mês (12m)
    const monthMap = new Map<string, { month: string; revenue: number; profit: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, { month: key, revenue: 0, profit: 0 });
    }
    for (const r of sales) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const slot = monthMap.get(key);
      if (slot) {
        slot.revenue += Number(r.total || 0);
        slot.profit += Number(r.profit || 0);
      }
    }
    const salesByMonth = Array.from(monthMap.values());

    // Top produtos
    const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const r of sales) {
      for (const it of (r.items ?? []) as any[]) {
        const k = it.name as string;
        const slot = prodMap.get(k) ?? { name: k, qty: 0, revenue: 0 };
        slot.qty += Number(it.qty || 0);
        slot.revenue += Number(it.qty || 0) * Number(it.price || 0);
        prodMap.set(k, slot);
      }
    }
    const topProducts = Array.from(prodMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);

    const recent = sales.slice(0, 10);

    return {
      kpis: {
        revenueToday,
        revenueMonth,
        totalInvested,
        profitGrossMonth,
        profitNetMonth,
        productsSoldMonth,
        stockUnits,
      },
      salesByDay,
      salesByMonth,
      topProducts,
      recent,
    };
  });
