// @ts-nocheck
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const OWNER_EMAIL = "grupogfredevarejistaoficial@gmail.com";
import {
  Menu, Search, ShoppingCart, Bell, X, Home as HomeIcon, Package, Heart, User,
  Grid, HelpCircle, Shield, Phone, Calendar, IdCard, MapPin, Camera, Edit,
  MessageCircle, Image as ImageIcon, Tag, ClipboardList, Plus, Trash2, Upload,
  Copy, Download, Check, Minus, LogOut, Star, Settings, Lock, Mail,
  CreditCard, Gift, Wallet, BellRing, DollarSign,
  Store, Eye, ChevronRight, ChevronDown, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, FileText,
  BadgeCheck, SlidersHorizontal, Truck, ShieldCheck, Headphones,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import logo from "@/assets/gf-shield-logo.png";
import { createCheckout } from "@/lib/checkout.functions";
import { getWallet } from "@/lib/wallet.functions";
import {
  listNotifications, markNotificationRead, listCashback,
  adminCashbackReport, adminMarkExpiredTransferred, listMyOrders,
} from "@/lib/customer.functions";
import { activatePartnerSelf } from "@/lib/partners.functions";
import { listFeaturedPartners } from "@/lib/partner-panel.functions";
import { useStoreState } from "@/hooks/useStoreState";
import { BannerCarousel } from "@/components/BannerCarousel";
import { InstallAppButton } from "@/components/InstallAppButton";
import { OrderTrackingTimeline, STATUS_TO_STEP, trackingCodeFromId } from "@/components/OrderTracking";
import { CompraSeguraSeal, CompraSeguraTag } from "@/components/CompraSegura";
import { ChatButton } from "@/components/ChatWidget";
import bannerEscolhaInteligente from "@/assets/banner-escolha-inteligente.png.asset.json";
import bannerMarketplace from "@/assets/banner-marketplace-grupo-gf.png.asset.json";
import bannerParceiro from "@/assets/banner-parceiro-grupo-gf.png.asset.json";
import bannerBoasVindas from "@/assets/banner-boas-vindas-grupo-gf.png.asset.json";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GRUPO GF REDE VAREJISTA" },
      { name: "description", content: "Aplicativo oficial do Grupo GF: ofertas, categorias e compras pelo WhatsApp." },
      { property: "og:title", content: "GRUPO GF REDE VAREJISTA" },
      { property: "og:description", content: "Aplicativo oficial do Grupo GF: ofertas, categorias e compras pelo WhatsApp." },
    ],
  }),
  component: App,
});

/* ---------- Types & Storage ---------- */
type Product = {
  id: string; name: string; price: number; oldPrice?: number;
  category: string; subcategory?: string; image: string; description?: string; stock: number;
  sellerName?: string; partnerId?: string | null;
  notes?: string;
  images?: string[];
  variants?: ProductVariant[];
};
type ProductVariant = {
  id: string;
  name: string;
  price: number;
  discount_price?: number | null;
  stock: number;
  image_url?: string | null;
  attributes?: { color?: string; size?: string } & Record<string, unknown>;
};
type StoreSettings = {
  storeName: string; whatsapp: string; cnpj: string; owner: string;
  address: string; email: string; instagram: string; deliveryFee: number; minOrder: number;
};
type Banner = { id: string; title: string; subtitle: string; image: string };
type Coupon = { code: string; discount: number; type: "percent" | "fixed" };
type CartItem = { productId: string; qty: number };
type Order = {
  id: string; date: string; items: { name: string; qty: number; price: number }[];
  total: number; status: "Pendente" | "Confirmado" | "Entregue";
  tracking?: string; history?: Record<string, string>;
};
type UserData = {
  name: string; phone: string; email: string; pin: string;
  cpf?: string; address?: string; birthdate?: string; avatar?: string;
  favorites: string[];
};

const WHATSAPP = "5542998722699";

const LS = {
  user: "gf_user",
  products: "gf_products",
  banners: "gf_banners",
  coupons: "gf_coupons",
  cart: "gf_cart",
  orders: "gf_orders",
  settings: "gf_settings",
  addresses: "gf_addresses",
  partners: "gf_featured_partners",
};

export type Address = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  zip: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
  isDefault?: boolean;
};

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "GRUPO GF REDE VAREJISTA",
  whatsapp: "5542998722699",
  cnpj: "55.844.536/0001-85",
  owner: "Ezequiel de Farias Carvalho",
  address: "",
  email: "",
  instagram: "",
  deliveryFee: 0,
  minOrder: 300,
};

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; }
  catch { return fallback; }
}
function save<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

const seedProducts: Product[] = [];
const seedBanners: Banner[] = [
  { id: "gf-escolha", title: "A escolha inteligente para você", subtitle: "Qualidade, segurança e as melhores condições", image: bannerEscolhaInteligente.url },
  { id: "gf-marketplace", title: "Marketplace Grupo GF", subtitle: "Tudo o que você procura em um só lugar", image: bannerMarketplace.url },
  { id: "gf-parceiro", title: "Torne-se um parceiro do Grupo GF", subtitle: "Cadastre sua loja e comece a vender", image: bannerParceiro.url },
  { id: "gf-boas-vindas", title: "Bem-vindo ao Grupo GF", subtitle: "Qualidade, economia e confiança", image: bannerBoasVindas.url },
];

// Module-level caches so navigating away and pressing the browser Back
// button doesn't blank out the home screen while async loaders re-run.
let cachedDbProducts: Product[] = load<Product[]>(LS.products, []);
let cachedUser: UserData | null = null;
let cachedUserId: string | null = null;
let cachedUserType: "lojista" | "pessoa_fisica" | null = null;
let cachedTab: Tab = "home";
let cachedCart: CartItem[] | null = null;
let cachedOrders: Order[] | null = null;
let cachedActiveCategory: string = "Todas";
let cachedFeaturedPartners: any[] = load<any[]>(LS.partners, []);
const seedCoupons: Coupon[] = [
  { code: "BEMVINDO10", discount: 10, type: "percent" },
  { code: "GF20", discount: 20, type: "fixed" },
];

/* ---------- Categories Tree ---------- */
import { CATEGORIES_TREE as CATEGORIES_TREE_EXT, ALL_CATEGORIES as ALL_CATEGORIES_EXT } from "@/lib/categories";
const CATEGORIES_TREE = CATEGORIES_TREE_EXT;
const ALL_CATEGORIES = ALL_CATEGORIES_EXT;



/* ---------- Helpers ---------- */
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const uid = () => Math.random().toString(36).slice(2, 10);
const fallbackProductImage = logo;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---------- App ---------- */
type Tab = "home" | "categories" | "cart" | "orders" | "profile" | "faq" | "admin" | "favorites" | "notifications" | "cashback";

function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserData | null>(() => cachedUser);
  const [userId, setUserId] = useState<string | null>(() => cachedUserId);
  const [userType, setUserType] = useState<"lojista" | "pessoa_fisica" | null>(() => cachedUserType);
  const [tab, setTab] = useState<Tab>(() => cachedTab);

  const [drawerOpen, setDrawerOpen] = useState(false);
  /* Shared store state (products/banners/coupons/settings) lives in the DB so
     admin edits propagate to every client in real time. */
  const { state: storeState, mutate: mutateStore } = useStoreState({
    products: seedProducts,
    banners: seedBanners,
    coupons: seedCoupons,
    settings: DEFAULT_SETTINGS,
  });
  const legacyProducts = storeState.products as Product[];
  const [dbProducts, setDbProducts] = useState<Product[]>(() => cachedDbProducts);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const adminRes = await supabase
        .from("products")
        .select("id,name,price,discount_price,image_url,images,stock_quantity,category,subcategory,active,description,notes,product_variants:product_variants!product_variants_product_id_fkey(id,name,price,discount_price,stock,image_url,attributes)")
        .eq("active", true)
        .order("created_at", { ascending: false });
      const partnerRes = await (supabase as any)
        .from("partner_products")
        .select("id,name,price,discount_price,image_url,images,stock_quantity,category,subcategory,active,description,notes,approval_status,partner_id,product_variants:product_variants!product_variants_partner_product_id_fkey(id,name,price,discount_price,stock,image_url,attributes)")
        .eq("active", true)
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false });
      if (adminRes.error) console.error("[home products]", adminRes.error.message);
      if (partnerRes.error) console.error("[home partner_products]", partnerRes.error.message);
      if (cancelled) return;
      const mapAdmin = (p: any): Product => ({
        id: p.id,
        name: p.name,
        price: Number(p.discount_price ?? p.price) || 0,
        oldPrice: p.discount_price != null && Number(p.discount_price) < Number(p.price) ? Number(p.price) : undefined,
        category: p.category || "Outros",
        subcategory: p.subcategory || undefined,
        image: p.image_url || fallbackProductImage,
        description: p.description || undefined,
        stock: Number(p.stock_quantity) || 0,
        sellerName: "GRUPO GF REDE VAREJISTA",
        partnerId: null,
        notes: p.notes || undefined,
        images: Array.isArray(p.images) ? p.images : [],
        variants: Array.isArray(p.product_variants) ? p.product_variants.map((v: any) => ({
          id: v.id, name: v.name, price: Number(v.price) || 0,
          discount_price: v.discount_price != null ? Number(v.discount_price) : null,
          stock: Number(v.stock) || 0, image_url: v.image_url, attributes: v.attributes || {},
        })) : [],
      });
      const mapPartner = (p: any): Product => ({
        ...mapAdmin(p),
        sellerName: "Loja parceira",
        partnerId: p.partner_id || null,
      });
      const merged: Product[] = [];
      if (!adminRes.error && adminRes.data) merged.push(...adminRes.data.map(mapAdmin));
      if (!partnerRes.error && partnerRes.data) merged.push(...partnerRes.data.map(mapPartner));
      if (!adminRes.error || !partnerRes.error) {
        cachedDbProducts = merged;
        save(LS.products, merged);
        setDbProducts(merged);
      } else if (cachedDbProducts.length) {
        setDbProducts(cachedDbProducts);
      }
    };
    load();
    const ch = supabase
      .channel("products_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_products" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);
  const products = useMemo<Product[]>(() => {
    const map = new Map<string, Product>();
    for (const p of legacyProducts) map.set(p.id, p);
    for (const p of dbProducts) map.set(p.id, p); // db wins on conflict
    return Array.from(map.values());
  }, [legacyProducts, dbProducts]);
  const banners = useMemo<Banner[]>(() => {
    const configured = storeState.banners as Banner[];
    const byId = new Map(seedBanners.map((banner) => [banner.id, banner]));
    for (const banner of configured) byId.set(banner.id, banner);
    return Array.from(byId.values());
  }, [storeState.banners]);
  const coupons = storeState.coupons as Coupon[];
  const settings = { ...DEFAULT_SETTINGS, ...(storeState.settings as Partial<StoreSettings>) };
  const setProducts = (next: Product[] | ((prev: Product[]) => Product[])) => {
    const v = typeof next === "function" ? (next as any)(products) : next;
    mutateStore({ products: v });
  };
  const setBanners = (next: Banner[] | ((prev: Banner[]) => Banner[])) => {
    const v = typeof next === "function" ? (next as any)(banners) : next;
    mutateStore({ banners: v });
  };
  const setCoupons = (next: Coupon[] | ((prev: Coupon[]) => Coupon[])) => {
    const v = typeof next === "function" ? (next as any)(coupons) : next;
    mutateStore({ coupons: v });
  };
  const setSettings = (next: StoreSettings | ((prev: StoreSettings) => StoreSettings)) => {
    const v = typeof next === "function" ? (next as any)(settings) : next;
    mutateStore({ settings: v });
  };

  const [cart, setCart] = useState<CartItem[]>(() => cachedCart ?? []);
  const [orders, setOrders] = useState<Order[]>(() => cachedOrders ?? []);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(() => cachedActiveCategory);
  const [sortBy, setSortBy] = useState<"relevance" | "price-asc" | "price-desc" | "discount" | "name">("relevance");
  const [maxPrice, setMaxPrice] = useState<number>(0); // 0 = no limit
  const [showFilters, setShowFilters] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [mpLoading, setMpLoading] = useState(false);
  const createCheckoutFn = useServerFn(createCheckout);
  const fetchNotifications = useServerFn(listNotifications);
  const markNotifRead = useServerFn(markNotificationRead);
  const fetchCashback = useServerFn(listCashback);
  const fetchMyOrders = useServerFn(listMyOrders);
  const [remoteOrders, setRemoteOrders] = useState<any[]>([]);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [cashback, setCashback] = useState<{ available: number; totalEarned: number; totalUsed: number; totalExpired: number; credits: any[] }>({ available: 0, totalEarned: 0, totalUsed: 0, totalExpired: 0, credits: [] });
  const [useCashbackAmount, setUseCashbackAmount] = useState<number>(0);
  const [toast, setToast] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isPartner, setIsPartner] = useState(false);
  const navigate = useNavigate();
  const activatePartner = useServerFn(activatePartnerSelf);
  const [partnerActivating, setPartnerActivating] = useState(false);
  const signOutToLogin = useCallback(async () => {
    setDrawerOpen(false);
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" } as any),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {}
    try { localStorage.removeItem(LS.user); } catch {}
    cachedUser = null;
    cachedUserId = null;
    cachedUserType = null;
    cachedTab = "home";
    setUser(null);
    setUserId(null);
    setUserType(null);
    setIsOwner(false);
    setIsPartner(false);
    setTab("home");
    navigate({ to: "/auth", replace: true });
  }, [navigate]);
  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email?.toLowerCase().trim() ?? "";
      const uid = data.user?.id;
      if (!uid) { setIsOwner(false); setIsPartner(false); if (email === OWNER_EMAIL) setIsOwner(true); return; }
      try {
        if (email === OWNER_EMAIL) {
          await (supabase as any).rpc("ensure_designated_owner_role");
        }
        const { data: roles } = await (supabase as any)
          .from("user_roles").select("role").eq("user_id", uid)
          .in("role", ["admin", "owner", "partner"]);
        const r = (roles ?? []).map((x: any) => x.role);
        setIsOwner(email === OWNER_EMAIL || r.includes("admin") || r.includes("owner"));
        if (r.includes("partner")) {
          setIsPartner(true);
        } else {
          const { data: partner } = await (supabase as any)
            .from("partners")
            .select("status")
            .eq("user_id", uid)
            .eq("status", "approved")
            .maybeSingle();
          setIsPartner(Boolean(partner));
        }
      } catch { setIsOwner(email === OWNER_EMAIL); setIsPartner(false); }
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleActivatePartner = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setDrawerOpen(false);
      navigate({ to: "/auth" });
      return;
    }
    if (partnerActivating) return;
    setPartnerActivating(true);
    try {
      const result = await activatePartner({});
      if (result && "ok" in result && !result.ok) {
        throw new Error((result as any).error || "Não foi possível ativar Parceiro GF agora.");
      }
      setIsPartner(true);
      setDrawerOpen(false);
      setTab("home");
      setToast("Parabéns! Sua conta Parceiro GF foi ativada com sucesso.");
      setTimeout(() => setToast(null), 4000);
    } catch (e: any) {
      setToast(e?.message || "Falha ao ativar Parceiro GF.");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setPartnerActivating(false);
    }
  }, [activatePartner, navigate, partnerActivating]);
  const [productModal, setProductModal] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [delivery, setDelivery] = useState({
    customerName: "", customerPhone: "", customerEmail: "",
    recipientName: "", recipientPhone: "",
    zip: "", street: "", number: "", complement: "",
    neighborhood: "", city: "", state: "", reference: "", notes: "",
  });

  const refreshNotifs = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetchNotifications({});
      setNotifs(r.notifications);
    } catch (e) { console.error(e); }
  }, [userId, fetchNotifications]);

  const refreshCashback = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetchCashback({});
      setCashback(r);
    } catch (e) { console.error(e); }
  }, [userId, fetchCashback]);

  const refreshMyOrders = useCallback(async () => {
    if (!userId) { setRemoteOrders([]); return; }
    try {
      const r = await fetchMyOrders({});
      setRemoteOrders(r.orders ?? []);
    } catch (e) { console.error(e); }
  }, [userId, fetchMyOrders]);


  /* Load local-only state (cart, orders) + Supabase user */
  useEffect(() => {
    if (cachedCart === null) setCart(load<CartItem[]>(LS.cart, []));
    if (cachedOrders === null) setOrders(load<Order[]>(LS.orders, []));

    const applyAuthUser = (authUser: any | null) => {
      if (!authUser) {
        setUser(null);
        setUserId(null);
        setUserType(null);
        return;
      }
      const meta = (authUser.user_metadata ?? {}) as Record<string, string>;
      setUserType(meta.user_type === "lojista" ? "lojista" : "pessoa_fisica");
      setUserId(authUser.id);
      setUser({
        name: meta.full_name || authUser.email?.split("@")[0] || "Cliente",
        phone: meta.phone || "",
        email: authUser.email || "",
        pin: "",
        favorites: load<UserData | null>(LS.user, null)?.favorites ?? [],
      });
    };

    let mounted = true;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!mounted) return;
        applyAuthUser(sessionData.session?.user ?? null);
      } catch (e) {
        console.error("[init] session check failed:", e);
      } finally {
        if (mounted) setReady(true);
      }

      try {
        const { data } = await supabase.auth.getUser();
        if (mounted && data?.user) applyAuthUser(data.user);
      } catch (e) {
        console.error("[init] auth check failed:", e);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      applyAuthUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* Load notifications + cashback once user is known, plus poll every 30s */
  useEffect(() => {
    if (!userId) return;
    refreshNotifs();
    refreshCashback();
    refreshMyOrders();
    const i = setInterval(() => { refreshNotifs(); refreshCashback(); refreshMyOrders(); }, 30000);
    return () => clearInterval(i);
  }, [userId, refreshNotifs, refreshCashback, refreshMyOrders]);


  /* Mercado Pago checkout return */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "approved") {
      setToast("Pagamento aprovado! Obrigado.");
      setTimeout(() => setToast(null), 3000);
      setCart([]); setAppliedCoupon(null); setCouponInput(""); setUseCashbackAmount(0);
      setTab("orders");
      window.history.replaceState({}, "", window.location.pathname);
      const tryRefresh = () => { fetchNotifications({}).then(r => setNotifs(r.notifications)).catch(() => {}); fetchCashback({}).then(r => setCashback(r)).catch(() => {}); fetchMyOrders({}).then(r => setRemoteOrders(r.orders ?? [])).catch(() => {}); };
      setTimeout(tryRefresh, 2500);
      setTimeout(tryRefresh, 8000);

    } else if (status === "pending") {
      setToast("Pagamento pendente. Avisaremos quando confirmar.");
      setTimeout(() => setToast(null), 3500);
      setTab("orders");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (status === "failure") {
      setToast("Pagamento não concluído.");
      setTimeout(() => setToast(null), 3000);
      setTab("cart");
      window.history.replaceState({}, "", window.location.pathname);
    }

  }, []);

  /* Persist local-only state and mirror to module cache so Back-navigation
     remounts of the home route show data immediately instead of flashing
     empty UI. */
  useEffect(() => { cachedCart = cart; if (ready) save(LS.cart, cart); }, [cart, ready]);
  useEffect(() => { cachedOrders = orders; if (ready) save(LS.orders, orders); }, [orders, ready]);
  useEffect(() => { cachedUser = user; if (ready && user) save(LS.user, user); }, [user, ready]);
  useEffect(() => { cachedUserId = userId; }, [userId]);
  useEffect(() => { cachedUserType = userType; }, [userType]);
  useEffect(() => { cachedTab = tab; }, [tab]);
  useEffect(() => { cachedActiveCategory = activeCategory; }, [activeCategory]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const categories = useMemo(() => {
    const fromProducts = new Set(products.map(p => p.category));
    const merged = Array.from(new Set([...ALL_CATEGORIES, ...fromProducts]));
    return ["Todas", ...merged];
  }, [products]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);


  const priceCeiling = useMemo(() => Math.max(50, ...products.map(p => p.price)), [products]);

  const filtered = useMemo(() => {
    const arr = products.filter(p => {
      if (activeCategory !== "Todas" && p.category !== activeCategory) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (maxPrice > 0 && p.price > maxPrice) return false;
      return true;
    });
    const sorted = [...arr];
    if (sortBy === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-desc") sorted.sort((a, b) => b.price - a.price);
    else if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "discount") sorted.sort((a, b) => {
      const da = a.oldPrice ? (1 - a.price / a.oldPrice) : 0;
      const db = b.oldPrice ? (1 - b.price / b.oldPrice) : 0;
      return db - da;
    });
    return sorted;
  }, [products, activeCategory, search, sortBy, maxPrice]);

  const cartDetailed = useMemo(() => {
    return cart.map(ci => {
      const p = products.find(x => x.id === ci.productId);
      return p ? { product: p, qty: ci.qty } : null;
    }).filter(Boolean) as { product: Product; qty: number }[];
  }, [cart, products]);

  const subtotal = cartDetailed.reduce((s, i) => s + i.product.price * i.qty, 0);
  const discount = !appliedCoupon ? 0
    : appliedCoupon.type === "percent" ? subtotal * appliedCoupon.discount / 100
    : Math.min(appliedCoupon.discount, subtotal);
  const maxCashbackUsable = Math.min(cashback.available, Math.max(0, subtotal - discount));
  const cashbackApplied = Math.min(useCashbackAmount, maxCashbackUsable);
  const total = Math.max(0, subtotal - discount - cashbackApplied);
  const wholesaleMin = userType === "lojista" ? Number(settings.minOrder || 0) : 0;
  const belowMin = wholesaleMin > 0 && subtotal < wholesaleMin;
  const unreadNotifs = notifs.filter(n => !n.read).length;


  /* Actions */
  const addToCart = (id: string) => {
    setCart(c => {
      const ex = c.find(i => i.productId === id);
      if (ex) return c.map(i => i.productId === id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { productId: id, qty: 1 }];
    });
    showToast("Adicionado ao carrinho");
  };
  const changeQty = (id: string, delta: number) => {
    setCart(c => c.flatMap(i => {
      if (i.productId !== id) return [i];
      const q = i.qty + delta;
      return q <= 0 ? [] : [{ ...i, qty: q }];
    }));
  };
  const removeFromCart = (id: string) => setCart(c => c.filter(i => i.productId !== id));

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    const found = coupons.find(c => c.code === code);
    if (!found) { showToast("Cupom inválido"); return; }
    setAppliedCoupon(found);
    showToast("Cupom aplicado!");
  };

  const toggleFavorite = (id: string) => {
    if (!user) return;
    const favs = user.favorites.includes(id)
      ? user.favorites.filter(x => x !== id)
      : [...user.favorites, id];
    setUser({ ...user, favorites: favs });
  };

  const checkout = (method: "whatsapp" | "pickup") => {
    if (cartDetailed.length === 0) return;
    if (belowMin) { showToast(`Pedido mínimo do atacado: ${brl(wholesaleMin)}`); return; }
    const oid = uid();
    const order: Order = {
      id: oid,
      date: new Date().toLocaleString("pt-BR"),
      items: cartDetailed.map(i => ({ name: i.product.name, qty: i.qty, price: i.product.price })),
      total,
      status: "Pendente",
      tracking: trackingCodeFromId(oid),
      history: { received: new Date().toISOString() },
    };
    setOrders(o => [order, ...o]);
    const msg = encodeURIComponent(
      `*Novo Pedido — GRUPO GF REDE VAREJISTA*\nCliente: ${user?.name}\n\n` +
      cartDetailed.map(i => `• ${i.qty}x ${i.product.name} — ${brl(i.product.price * i.qty)}`).join("\n") +
      (appliedCoupon ? `\nCupom: ${appliedCoupon.code} (-${brl(discount)})` : "") +
      `\n\n*Total: ${brl(total)}*\nMétodo: ${method === "whatsapp" ? "WhatsApp" : "Retirada"}`
    );
    window.open(`https://wa.me/${settings.whatsapp || WHATSAPP}?text=${msg}`, "_blank");
    setCart([]); setAppliedCoupon(null); setCouponInput("");
    setTab("orders");
  };

  const openCheckout = () => {
    if (cartDetailed.length === 0) return;
    if (belowMin) { showToast(`Pedido mínimo do atacado: ${brl(wholesaleMin)}`); return; }
    setDelivery(d => ({
      ...d,
      customerName: d.customerName || user?.name || "",
      customerPhone: d.customerPhone || user?.phone || "",
      customerEmail: d.customerEmail || user?.email || "",
      recipientName: d.recipientName || user?.name || "",
      recipientPhone: d.recipientPhone || user?.phone || "",
    }));
    setCheckoutOpen(true);
  };

  const submitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartDetailed.length === 0 || mpLoading) return;
    setMpLoading(true);
    try {
      const res = await createCheckoutFn({
        data: {
          items: cartDetailed.map(i => ({
            name: i.product.name,
            qty: i.qty,
            price: i.product.price,
            image: /^https?:\/\//.test(i.product.image) ? i.product.image : undefined,
            productId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(i.product.id) ? i.product.id : undefined,
          })),
          couponCode: appliedCoupon?.code,
          discount: discount > 0 ? discount : undefined,
          cashbackAmount: useCashbackAmount > 0 ? useCashbackAmount : undefined,
          userId: userId ?? undefined,
          ...delivery,
        },

      });
      if (res.url) {
        setCheckoutOpen(false);
        window.location.assign(res.url);
      } else {
        showToast(res.error || "Erro ao iniciar pagamento");
      }
    } catch (err) {
      console.error(err);
      showToast("Erro ao iniciar pagamento");
    } finally {
      setMpLoading(false);
    }
  };

  if (!ready) return <div className="min-h-screen bg-[#0a1628]" />;

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="min-h-screen pb-24 text-slate-100" style={{ background: "#0a1628" }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-500 text-white px-5 py-2.5 rounded-lg font-semibold shadow-lg animate-[slideDown_.3s_ease]">
          {toast}
        </div>
      )}

      {/* Drawer (estilo loja parceira) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[950] flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="relative h-full w-[86%] max-w-[360px] overflow-y-auto bg-[#0a1628] ring-1 ring-cyan-500/20">
            {/* Header com logo + Marketplace Oficial */}
            <div className="flex items-start gap-3 p-4">
              <img src={logo} alt="Grupo GF" className="h-14 w-14 shrink-0 rounded-lg bg-white/5 p-1 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold uppercase tracking-wide text-white">GRUPO GF</p>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-400">Rede Varejista</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                  <BadgeCheck className="h-3 w-3" /> Marketplace Oficial
                </span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/5 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Card usuário / visitante */}
            <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-[#0f1d32] p-3 ring-1 ring-cyan-500/15">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#0a1628] ring-1 ring-cyan-500/20 overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-5 w-5 text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">
                  {user ? `Olá, ${user.name.split(" ")[0]}!` : "Olá, visitante!"}
                </p>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {user ? "Bem-vindo de volta" : "Faça login e aproveite as melhores ofertas"}
                </p>
              </div>
              {!user && (
                <button
                  onClick={() => { setDrawerOpen(false); navigate({ to: "/auth" }); }}
                  className="rounded-lg px-3 py-2 text-xs font-bold text-white shadow-md"
                  style={{ background: "linear-gradient(135deg,#0a4fe3,#8b5cf6)" }}
                >
                  Entrar <ChevronRight className="inline h-3 w-3" />
                </button>
              )}
            </div>

            {/* Carteira GF */}
            <div className="mx-4 mb-4 rounded-xl bg-[#0f1d32] p-3 ring-1 ring-cyan-500/15">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <Wallet className="h-4 w-4 text-cyan-400" /> Carteira GF
                </span>
                <button
                  onClick={() => { setDrawerOpen(false); navigate({ to: "/carteira" }); }}
                  className="flex items-center gap-0.5 text-xs font-semibold text-cyan-400"
                >
                  Ver detalhes <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <p className="text-slate-400">Saldo disponível</p>
                  <p className="font-bold text-emerald-400">R$ 0,00</p>
                </div>
                <div>
                  <p className="text-slate-400">Saldo pendente</p>
                  <p className="font-bold text-orange-400">R$ 0,00</p>
                </div>
                <div>
                  <p className="text-slate-400">Meu cashback</p>
                  <p className="font-bold text-violet-400">{brl(cashback.available || 0)}</p>
                </div>
              </div>
            </div>

            {/* Admin shortcut */}
            {isOwner && (
              <div className="mx-4 mb-3">
                <button
                  onClick={() => { setDrawerOpen(false); navigate({ to: "/admin/dashboard" }); }}
                  className="w-full rounded-xl px-3 py-2.5 flex items-center gap-3 font-semibold text-white shadow-md"
                  style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}
                >
                  <Shield size={18} /> Administração
                </button>
              </div>
            )}

            {/* PRINCIPAL */}
            <p className="px-5 pb-1 text-[11px] font-bold tracking-wider text-slate-500">PRINCIPAL</p>
            <div className="px-2">
              {[
                { t: "home", label: "Início", icon: HomeIcon },
                { t: "categories", label: "Categorias", icon: Grid },
                { t: "cart", label: "Carrinho", icon: ShoppingCart, badge: cartCount },
                { t: "favorites", label: "Favoritos", icon: Heart, badge: user?.favorites.length || 0 },
                { t: "notifications", label: "Notificações", icon: Bell, badge: unreadNotifs },
                { t: "cashback", label: "Meu Cashback", icon: DollarSign },
                { t: "orders", label: "Minhas Compras", icon: Package },
                { t: "profile", label: "Perfil", icon: User },
                { t: "faq", label: "FAQ", icon: HelpCircle },
              ].map((it: any) => {
                const active = tab === it.t;
                return (
                  <button
                    key={it.t}
                    onClick={() => { setTab(it.t as Tab); setDrawerOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm ${
                      active
                        ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30"
                        : "text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <it.icon className={`h-5 w-5 ${active ? "text-cyan-400" : "text-slate-400"}`} />
                    <span className="flex-1 text-left font-medium">{it.label}</span>
                    {it.badge > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {it.badge}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>
                );
              })}
            </div>

            {/* VENDA COM A GENTE */}
            <p className="mt-3 px-5 pb-1 text-[11px] font-bold tracking-wider text-slate-500">VENDA COM A GENTE</p>
            <div className="px-4 pb-2">
              {isPartner ? (
                <button
                  onClick={() => { setDrawerOpen(false); navigate({ to: "/parceiro" as any }); }}
                  className="flex w-full items-center gap-3 rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-500/40 hover:bg-emerald-500/15"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/20">
                    <Store className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-bold text-emerald-300">PARCEIRO GF ATIVADO</p>
                    <p className="text-[11px] text-slate-400">Acessar painel do parceiro</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-emerald-400" />
                </button>
              ) : (
                <button
                  onClick={handleActivatePartner}
                  disabled={partnerActivating}
                  className="flex w-full items-center gap-3 rounded-xl bg-cyan-500/10 p-3 ring-1 ring-cyan-500/40 hover:bg-cyan-500/15 disabled:opacity-60"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-500/20">
                    <Store className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-bold text-cyan-300">
                      {partnerActivating ? "ATIVANDO..." : "TORNE-SE PARCEIRO GF"}
                    </p>
                    <p className="text-[11px] text-slate-400">Venda online e aumente seus ganhos</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-cyan-400" />
                </button>
              )}
            </div>

            {/* TODAS AS CATEGORIAS */}
            <p className="mt-3 px-5 pb-1 text-[11px] font-bold tracking-wider text-slate-500">TODAS AS CATEGORIAS</p>
            <div className="px-2 pb-4">
              {ALL_CATEGORIES.map((c) => {
                const subs = CATEGORIES_TREE[c] || [];
                const open = expandedCategory === c;
                const count = products.filter((p) => p.category === c).length;
                return (
                  <div key={c}>
                    <button
                      onClick={() => {
                        if (subs.length === 0) {
                          setActiveCategory(c); setSearch(""); setTab("home"); setDrawerOpen(false);
                        } else {
                          setExpandedCategory(open ? null : c);
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-200 hover:bg-white/5"
                    >
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-[#0f1d32] ring-1 ring-cyan-500/15">
                        <Package className="h-4 w-4 text-slate-300" />
                      </div>
                      <span className="flex-1 text-left font-medium">{c}</span>
                      <span className="text-xs text-slate-400">{count}</span>
                      {subs.length > 0 ? (
                        open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      )}
                    </button>
                    {open && subs.length > 0 && (
                      <div className="ml-12 border-l border-cyan-500/15 pl-2">
                        <button
                          onClick={() => { setActiveCategory(c); setSearch(""); setTab("home"); setDrawerOpen(false); }}
                          className="block w-full rounded px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5"
                        >
                          Tudo em {c}
                        </button>
                        {subs.map((s) => (
                          <button
                            key={s}
                            onClick={() => { setActiveCategory(c); setSearch(s); setTab("home"); setDrawerOpen(false); }}
                            className="block w-full rounded px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Logout + install */}
            <div className="px-2 pb-2 border-t border-white/5 pt-2">
              <button
                onClick={signOutToLogin}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-red-400 hover:bg-white/5"
              >
                <LogOut className="h-5 w-5" /> <span className="flex-1 text-left font-medium">Sair</span>
              </button>
              <div className="px-1 pt-2"><InstallAppButton /></div>
            </div>

            {/* Trust ribbon footer */}
            <div className="grid grid-cols-2 gap-3 border-t border-cyan-500/10 bg-[#0a1628]/80 p-4 text-[11px]">
              {[
                { icon: Truck, t: "Frete Grátis", s: "acima de R$199", c: "text-cyan-400" },
                { icon: ShieldCheck, t: "Compra Segura", s: "ambiente protegido", c: "text-emerald-400" },
                { icon: Tag, t: "Parcelamento", s: "em até 6x", c: "text-violet-400" },
                { icon: Headphones, t: "Suporte 24h", s: "atendimento rápido", c: "text-amber-400" },
              ].map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <it.icon className={`h-4 w-4 ${it.c}`} />
                  <div className="leading-tight">
                    <p className="font-semibold text-slate-200">{it.t}</p>
                    <p className="text-slate-400">{it.s}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* Header premium navy + gold */}
      <header className="sticky top-0 z-50 border-b border-[#c9a84c]/30 shadow-lg" style={{ background: "linear-gradient(180deg,#0b1a3a 0%,#0f1f45 100%)" }}>
        <div className="flex items-center gap-2 px-3 py-3">
          <button onClick={() => setDrawerOpen(true)} className="rounded-md p-2 text-[#f0d78c] hover:bg-white/10" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <button onClick={() => setTab("home")} className="flex items-center gap-2 min-w-0">
            <div className="h-11 w-11 shrink-0 overflow-hidden">
              <img src={logo} alt="Grupo GF" className="h-full w-full object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
            </div>
            <div className="min-w-0 leading-tight text-left">
              <p className="truncate text-[15px] font-extrabold tracking-[0.14em] uppercase" style={{ color: "#f0d78c", fontFamily: "'Cormorant Garamond','Playfair Display',serif" }}>
                Grupo GF Varejista
              </p>
              <p className="flex items-center gap-1 text-[10px] font-semibold text-[#c9a84c]/80 tracking-wider uppercase">
                <BadgeCheck className="h-3 w-3" /> Marketplace Oficial
              </p>
            </div>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setTab("cart")} className="relative rounded-md p-2 text-[#f0d78c] hover:bg-white/10">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#c9a84c] px-1 text-[10px] font-bold text-[#0b1a3a]">{cartCount}</span>
              )}
            </button>
            <button onClick={() => setTab("notifications")} className="relative rounded-md p-2 text-[#f0d78c] hover:bg-white/10">
              <Bell className="h-5 w-5" />
              {unreadNotifs > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadNotifs}</span>
              )}
            </button>
          </div>
        </div>
        <div className="px-3 pb-3">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c9a84c]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Explore as Ofertas Únicas do Grupo GF..."
                className="w-full rounded-full bg-white py-2.5 pl-9 pr-10 text-sm text-slate-800 ring-1 ring-[#c9a84c]/40 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#c9a84c]"
              />
              <Camera className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c9a84c]" />
            </div>
          </div>
        </div>
      </header>

      {/* HOME */}
      {tab === "home" && (
        <div className="pt-3">
          <div className="px-4">
            <BannerCarousel banners={banners} />
          </div>

          <div className="mt-4 flex gap-2.5 overflow-x-auto px-4 pb-2">
            {[
              { icon: Tag, label: "Ofertas Únicas" },
              { icon: BadgeCheck, label: "Clube GF" },
              { icon: Gift, label: "Cesta GF" },
              { icon: Store, label: "Ofertas Relâmpago" },
              { icon: DollarSign, label: "Cashback" },
            ].map((q, i) => (
              <div key={i} className="shrink-0 w-[86px] rounded-2xl bg-white shadow-[0_2px_10px_-4px_rgba(11,26,58,0.15)] border border-[#c9a84c]/25 p-2 flex flex-col items-center gap-1.5">
                <div className="h-11 w-11 rounded-full grid place-items-center" style={{ background: "linear-gradient(135deg,#f5e6a8,#c9a84c)" }}>
                  <q.icon className="h-5 w-5 text-[#0b1a3a]" />
                </div>
                <span className="text-[10px] font-semibold text-center text-slate-700 leading-tight">{q.label}</span>
              </div>
            ))}
          </div>

          <div className="px-4 mt-3">
            <Link to="/indique-e-ganhe" className="block rounded-2xl overflow-hidden relative border border-[#c9a84c]/40 shadow-xl" style={{ background: "linear-gradient(135deg,#0b1a3a 0%,#1a1a1a 60%,#0b1a3a 100%)" }}>
              <div className="relative p-5 pr-24">
                <h3 className="text-transparent bg-clip-text text-2xl font-bold leading-tight tracking-wide" style={{ backgroundImage: "linear-gradient(135deg,#f5e6a8,#c9a84c)", fontFamily: "'Cormorant Garamond','Playfair Display',serif" }}>GF+ Premium Club</h3>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-white/80 leading-snug">Grupo GF Prestige Club — Experiências e Benefícios Exclusivos</p>
                <span className="mt-3 inline-block rounded-md px-4 py-1.5 text-xs font-bold tracking-wider text-[#0b1a3a] shadow-md" style={{ background: "linear-gradient(135deg,#f5e6a8,#c9a84c)" }}>JUNTE-SE À ELITE</span>
              </div>
              <div className="absolute right-0 top-0 bottom-0 w-28 opacity-30 bg-[radial-gradient(circle_at_70%_50%,rgba(201,168,76,0.6),transparent_70%)]" />
            </Link>
          </div>

          <div className="flex gap-2 my-4 px-4">
            <div className="flex-1 min-w-0"><InstallAppButton /></div>
            <Link to="/seja-um-parceiro" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#0b1a3a] shadow-md hover:opacity-90 whitespace-nowrap" style={{ background: "linear-gradient(135deg,#f5e6a8,#c9a84c)" }}>
              <Store size={14} /> Seja parceiro
            </Link>
          </div>

          <div className="px-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-base tracking-wider uppercase text-slate-800" style={{ fontFamily: "'Cormorant Garamond','Playfair Display',serif" }}>Destaques da Semana</h2>
            <button onClick={() => setShowFilters(v => !v)} className="text-xs px-3 py-1.5 rounded-full border border-[#c9a84c]/40 text-[#0b1a3a] hover:bg-[#c9a84c]/10 flex items-center gap-1.5 font-semibold">
              <Settings size={13} /> Filtros {(maxPrice > 0 || sortBy !== "relevance") && <span className="bg-[#c9a84c] text-[#0b1a3a] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">!</span>}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
            {categories.map(c => (
              <button key={c} onClick={() => setActiveCategory(c)}
                className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap border transition font-semibold ${
                  activeCategory === c
                    ? "border-transparent text-[#0b1a3a] shadow-md"
                    : "bg-white border-[#c9a84c]/40 text-[#0b1a3a] hover:bg-[#c9a84c]/10"
                }`}
                style={activeCategory === c ? { background: "linear-gradient(135deg,#f5e6a8,#c9a84c)" } : undefined}
              >
                {c}
              </button>
            ))}
          </div>
          </div>

          <LojasParceirasStrip />


          {showFilters && (
            <div className="card-premium p-4 mb-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-1.5">Ordenar por</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { v: "relevance", l: "Relevância" },
                    { v: "price-asc", l: "Menor preço" },
                    { v: "price-desc", l: "Maior preço" },
                    { v: "discount", l: "Maior desconto" },
                    { v: "name", l: "A-Z" },
                  ].map(o => (
                    <button key={o.v} onClick={() => setSortBy(o.v as typeof sortBy)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                        sortBy === o.v ? "bg-cyan-500 text-[#0a1628] border-cyan-500 font-semibold" : "bg-[#0f1d32] border-cyan-500/20 text-slate-300"
                      }`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-300">Preço máximo</p>
                  <span className="text-xs text-cyan-300 font-bold">{maxPrice > 0 ? brl(maxPrice) : "Sem limite"}</span>
                </div>
                <input type="range" min={0} max={Math.ceil(priceCeiling)} step={5} value={maxPrice}
                  onChange={e => setMaxPrice(Number(e.target.value))}
                  className="w-full accent-cyan-400" />
              </div>
              {(maxPrice > 0 || sortBy !== "relevance" || activeCategory !== "Todas" || search) && (
                <button onClick={() => { setMaxPrice(0); setSortBy("relevance"); setActiveCategory("Todas"); setSearch(""); }}
                  className="text-xs text-slate-400 hover:text-white underline">Limpar filtros</button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base">Destaques</h2>
            <span className="text-[11px] text-slate-400">{filtered.length} {filtered.length === 1 ? "produto" : "produtos"}</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-center text-sm py-8 text-slate-400">Nenhum produto encontrado.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {filtered.map(p => (
                <ProductCard key={p.id} product={p} onOpen={() => setProductModal(p)} onAdd={() => addToCart(p.id)}
                  isFav={user?.favorites.includes(p.id) ?? false} onFav={() => toggleFavorite(p.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* CATEGORIES */}
      {tab === "categories" && (
        <div className="px-4 pt-4">
          <h2 className="font-bold text-xl mb-1">Todas as Categorias</h2>
          <p className="text-xs text-slate-400 mb-4">{ALL_CATEGORIES.length} categorias com tudo o que você precisa</p>
          <div className="space-y-2">
            {ALL_CATEGORIES.map(c => {
              const subs = CATEGORIES_TREE[c] || [];
              const isOpen = expandedCategory === c;
              return (
                <div key={c} className="rounded-xl bg-[#162340] border border-cyan-500/10 overflow-hidden">
                  <button onClick={() => setExpandedCategory(isOpen ? null : c)}
                    className="w-full p-4 flex items-center justify-between hover:bg-white/5">
                    <span className="font-semibold text-left">{c}</span>
                    <span className="text-xs px-2 py-1 rounded-full text-white" style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>{subs.length}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                      {subs.map(s => (
                        <button key={s} onClick={() => { setActiveCategory(c); setSearch(s); setTab("home"); }}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-[#0f1d32] border border-orange-500/30 text-slate-200 hover:border-orange-400">
                          {s}
                        </button>
                      ))}
                      <button onClick={() => { setActiveCategory(c); setSearch(""); setTab("home"); }}
                        className="text-[11px] px-2.5 py-1 rounded-full text-white font-semibold" style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
                        Ver todos
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* CART */}
      {tab === "cart" && (
        <div className="px-4 pt-4">
          <h2 className="font-bold text-xl mb-4">Carrinho</h2>
          {cartDetailed.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ShoppingCart size={48} className="mx-auto mb-3 opacity-40" />
              <p>Seu carrinho está vazio.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-4">
                {cartDetailed.map(i => (
                  <div key={i.product.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3 flex gap-3">
                    <img src={i.product.image} alt="" className="w-16 h-16 rounded-lg object-cover" loading="lazy" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{i.product.name}</p>
                      <p className="text-cyan-400 font-bold text-sm">{brl(i.product.price)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => changeQty(i.product.id, -1)} className="w-7 h-7 rounded bg-[#0f1d32] flex items-center justify-center"><Minus size={14} /></button>
                        <span className="text-sm w-6 text-center">{i.qty}</span>
                        <button onClick={() => changeQty(i.product.id, 1)} className="w-7 h-7 rounded bg-[#0f1d32] flex items-center justify-center"><Plus size={14} /></button>
                        <button onClick={() => removeFromCart(i.product.id)} className="ml-auto text-red-400 p-1"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mb-3">
                <input value={couponInput} onChange={e => setCouponInput(e.target.value)}
                  className="flex-1 bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                  placeholder="Código do cupom" />
                <button onClick={applyCoupon} className="px-4 py-2 text-sm rounded-lg font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>Aplicar</button>
              </div>

              {/* Cashback toggle */}
              {cashback.available > 0 && (
                <div className="bg-cyan-500/10 border border-cyan-400/30 rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Gift size={18} className="text-cyan-300" />
                      <div>
                        <p className="text-sm font-semibold text-cyan-200">Usar meu cashback</p>
                        <p className="text-[11px] text-cyan-300/80">Saldo: {brl(cashback.available)} · até {brl(maxCashbackUsable)} neste pedido</p>
                      </div>
                    </div>
                    <label className="relative inline-block w-10 h-6">
                      <input type="checkbox" className="opacity-0 w-0 h-0 peer"
                        checked={useCashbackAmount > 0}
                        onChange={e => setUseCashbackAmount(e.target.checked ? maxCashbackUsable : 0)} />
                      <span className="absolute inset-0 bg-slate-600 rounded-full peer-checked:bg-cyan-500 transition" />
                      <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition peer-checked:translate-x-4" />
                    </label>
                  </div>
                  {useCashbackAmount > 0 && (
                    <p className="text-[11px] text-cyan-300/80">
                      <Calendar size={11} className="inline -mt-0.5" /> Lembre-se: cashback tem validade de 30 dias e só pode ser usado em compras.
                    </p>
                  )}
                </div>
              )}

              <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 mb-3">
                <div className="flex justify-between text-sm mb-2"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
                {appliedCoupon && (
                  <div className="flex justify-between text-sm mb-2 text-green-400">
                    <span>Desconto ({appliedCoupon.code})</span><span>-{brl(discount)}</span>
                  </div>
                )}
                {cashbackApplied > 0 && (
                  <div className="flex justify-between text-sm mb-2 text-cyan-300">
                    <span>Cashback usado</span><span>-{brl(cashbackApplied)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t border-white/10 pt-2">
                  <span>Total</span><span>{brl(total)}</span>
                </div>
              </div>


              {belowMin && (
                <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 mb-3 text-amber-200 text-sm">
                  <p className="font-semibold mb-1">Pedido mínimo do atacado: {brl(wholesaleMin)}</p>
                  <p className="text-xs">Faltam <strong>{brl(wholesaleMin - subtotal)}</strong> para liberar a finalização.</p>
                </div>
              )}

              <div className="space-y-2">
                <button onClick={openCheckout} disabled={mpLoading || belowMin}
                  className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg,#00b1ea,#2d3277)" }}>
                  <CreditCard size={18} /> Finalizar Compra (Cartão, Pix, Boleto)
                </button>
                <button onClick={() => checkout("whatsapp")} disabled={belowMin}
                  className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}>
                  <MessageCircle size={18} /> Finalizar pelo WhatsApp
                </button>
                <button onClick={() => checkout("pickup")} disabled={belowMin}
                  className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
                  <Phone size={18} /> Reservar e Retirar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ORDERS */}
      {tab === "orders" && (
        <div className="px-4 pt-4">
          <h2 className="font-bold text-xl mb-4">Meus Pedidos</h2>
          {remoteOrders.length === 0 && orders.length === 0 ? (
            <p className="text-center text-sm py-8 text-slate-400">Nenhum pedido ainda.</p>
          ) : (
            <div className="space-y-3">
              {remoteOrders.map((o: any) => <RemoteOrderCard key={o.id} order={o} />)}
              {orders.map(o => <LocalOrderCard key={o.id} order={o} />)}
            </div>
          )}
        </div>
      )}

      {/* PROFILE */}
      {tab === "profile" && user && (
        <ProfileTab
          user={user} setUser={setUser} orders={orders} products={products}
          onOpenProduct={p => setProductModal(p)}
          onGoFaq={() => setTab("faq")}
          onGoFavorites={() => setTab("favorites")}
          onGoCashback={() => setTab("cashback")}
          onGoNotifications={() => setTab("notifications")}
          cashbackAvailable={cashback.available}
          unreadNotifs={unreadNotifs}
          showToast={showToast}
          isOwner={isOwner}
          onGoAdmin={() => navigate({ to: "/admin/dashboard" })}
          onSignOut={signOutToLogin}
        />
      )}

      {/* FAVORITES */}
      {tab === "favorites" && user && (
        <FavoritesTab user={user} products={products} onOpen={p => setProductModal(p)} onToggle={id => toggleFavorite(id)} />
      )}

      {/* NOTIFICATIONS */}
      {tab === "notifications" && (
        <NotificationsTab
          items={notifs}
          onMarkRead={async (id) => { try { await markNotifRead({ data: { id } }); refreshNotifs(); } catch {} }}
          onMarkAll={async () => { try { await markNotifRead({ data: { all: true } }); refreshNotifs(); } catch {} }}
        />
      )}

      {/* CASHBACK */}
      {tab === "cashback" && (
        <CashbackTab data={cashback} onGoCart={() => setTab("cart")} />
      )}


      {/* FAQ */}
      {tab === "faq" && (
        <div className="px-4 pt-4">
          <h2 className="font-bold text-xl mb-4">Perguntas Frequentes</h2>
          <div className="space-y-3">
            {[
              ["Como faço um pedido?", "Adicione os produtos ao carrinho, escolha o endereço de entrega e finalize o pagamento pelo Mercado Pago (Pix, cartão ou boleto)."],
              ["Quais formas de pagamento são aceitas?", "Aceitamos Pix, cartão de crédito, cartão de débito e boleto bancário, tudo pelo Mercado Pago. Também dinheiro na entrega em alguns bairros."],
              ["Qual o prazo de entrega?", "Atendemos todo o Brasil. O prazo varia conforme a região: capitais e grandes centros em 1 a 3 dias úteis, demais cidades em 3 a 7 dias úteis após a confirmação do pagamento."],
              ["Qual o valor do frete?", "O frete é calculado conforme o bairro/cidade no momento do checkout. Pedidos acima do valor mínimo podem ter frete grátis em promoções."],
              ["Posso retirar na loja?", "Sim! Você pode escolher retirar na loja física do Grupo GF sem custo adicional. Avisaremos quando o pedido estiver pronto."],
              ["Como acompanho meu pedido?", "Vá em 'Pedidos' no menu inferior para ver o status: Pendente, Pago, Em preparo, Enviado ou Entregue."],
              ["Posso trocar ou devolver um produto?", "Sim, você tem até 7 dias após o recebimento para solicitar troca ou devolução, conforme o CDC. O produto deve estar na embalagem original."],
              ["Como uso um cupom de desconto?", "Insira o código do cupom no carrinho antes de finalizar. Experimente BEMVINDO10 para 10% OFF na primeira compra."],
              ["Como avaliar um produto?", "Após receber seu pedido (status 'Entregue'), abra o produto e deixe sua avaliação com nota, comentário e fotos."],
              ["Esqueci minha senha, o que fazer?", "Na tela de login, clique em 'Esqueci minha senha' e siga as instruções enviadas para seu e-mail."],
              ["Como altero meus dados cadastrais?", "Vá em 'Perfil' e toque em 'Informações do seu perfil' ou em 'Segurança' para alterar nome, telefone, e-mail, senha e foto."],
              ["Como cadastro um endereço de entrega?", "Em 'Perfil' → 'Endereços', toque em 'Adicionar novo endereço'. Você pode salvar quantos quiser e definir um como padrão."],
              ["Como altero ou removo um endereço?", "Em 'Perfil' → 'Endereços', toque em 'Editar' no endereço desejado, ou em 'Excluir' para removê-lo da sua lista."],
              ["Como troco minha foto de perfil?", "No 'Perfil', toque no ícone de câmera sobre a foto, ou vá em 'Segurança' → 'Alterar foto'."],
              ["Como excluo minha conta?", "Em 'Perfil', vá até 'Excluir conta', confirme digitando EXCLUIR. Esta ação é permanente e remove seus dados locais."],
              ["O atendimento é por WhatsApp?", `Sim! Fale com a gente pelo WhatsApp ${settings.whatsapp}. Atendimento de segunda a sábado, das 8h às 18h.`],
              ["Os produtos têm garantia?", "Eletrônicos e eletrodomésticos têm garantia do fabricante. Demais produtos seguem as condições padrão do CDC."],
              ["Vocês entregam em todo o Brasil?", "Sim! Atendemos todo o território nacional, do Oiapoque ao Chuí, com envio para qualquer CEP do Brasil."],
              ["Posso pedir produtos que não aparecem no app?", "Sim! Fale com a gente pelo WhatsApp informando o produto. Se tivermos em estoque, fazemos a inclusão para você."],
              ["Como funciona o pagamento na entrega?", "Em alguns bairros aceitamos pagamento no momento da entrega (dinheiro, Pix ou maquininha). Confirme a disponibilidade no checkout."],
              ["O app cobra alguma taxa?", "Não. O uso do app é gratuito. Você paga apenas pelos produtos e, quando houver, pelo frete da sua região."],
              ["Meus dados estão seguros?", "Sim. Usamos criptografia, pagamentos processados pelo Mercado Pago e não armazenamos dados de cartão. Seguimos a LGPD."],
              ["Como recebo novidades e promoções?", "Ative as notificações do app e siga o Grupo GF nas redes sociais. Também enviamos ofertas pelo WhatsApp para clientes cadastrados."],
              ["Posso ter mais de um endereço cadastrado?", "Sim! Salve quantos endereços quiser (casa, trabalho, casa dos pais) e escolha qual usar a cada compra."],
              ["Como cancelo um pedido?", "Enquanto o status estiver 'Pendente' ou 'Pago', fale com a gente pelo WhatsApp para solicitar o cancelamento e o estorno."],
            ].map(([q, a]) => (
              <details key={q} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 group">
                <summary className="font-semibold text-sm cursor-pointer flex items-center justify-between gap-2 list-none">
                  <span>{q}</span>
                  <Plus size={16} className="text-cyan-400 group-open:rotate-45 transition-transform shrink-0" />
                </summary>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* ADMIN */}
      {tab === "admin" && isOwner && (
        <AdminPanel
          products={products} setProducts={setProducts}
          banners={banners} setBanners={setBanners}
          coupons={coupons} setCoupons={setCoupons}
          orders={orders} setOrders={setOrders}
          settings={settings} setSettings={setSettings}
          editingProduct={editingProduct} setEditingProduct={setEditingProduct}
          showToast={showToast}
        />
      )}

      {/* Footer */}
      <footer className="px-4 py-6 border-t border-cyan-500/10 mb-16 mt-6 text-slate-300">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Sobre a loja */}
          <div>
            <h3 className="font-bold text-sm text-cyan-400 mb-1.5 flex items-center gap-1.5">
              <Star size={14} /> Sobre a loja
            </h3>
            <p className="text-xs leading-relaxed text-slate-400">
              O <span className="text-slate-200 font-semibold">Grupo GF Rede Varejista</span> nasceu de um sonho de
              família: <span className="text-slate-200">atender o Brasil inteiro com qualidade, economia e
              atendimento humano</span>. Começamos pequenos, com muito esforço e atenção a cada cliente, e hoje
              somos uma plataforma que conecta milhares de famílias a lojas parceiras em <span className="text-slate-200">todo o território nacional</span>.
              Entregamos em qualquer CEP do Brasil, com cashback, pagamento seguro pelo Mercado Pago e suporte por WhatsApp.
            </p>

          </div>

          {/* FAQs rápidas */}
          <div>
            <h3 className="font-bold text-sm text-cyan-400 mb-1.5 flex items-center gap-1.5">
              <HelpCircle size={14} /> Perguntas frequentes
            </h3>
            <div className="space-y-1.5">
              {[
                ["Como faço um pedido?", "Adicione ao carrinho, escolha o endereço e pague pelo Mercado Pago (Pix, cartão ou boleto)."],
                ["Qual o prazo de entrega?", "Atendemos todo o Brasil. 1 a 3 dias úteis para capitais e 3 a 7 dias úteis para demais cidades."],
                ["Posso retirar na loja?", "Sim, sem custo adicional. Avisamos quando o pedido estiver pronto."],
                ["Como vira parceiro?", "Toque em 'Seja um Parceiro GF' e envie seu cadastro para análise."],
              ].map(([q, a]) => (
                <details key={q} className="bg-[#162340] border border-cyan-500/10 rounded-lg px-3 py-2 group">
                  <summary className="text-xs font-semibold cursor-pointer flex items-center justify-between gap-2 list-none">
                    <span>{q}</span>
                    <Plus size={12} className="text-cyan-400 group-open:rotate-45 transition-transform shrink-0" />
                  </summary>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{a}</p>
                </details>
              ))}
              <button onClick={() => setTab("faq")} className="text-[11px] text-cyan-300 underline mt-1">
                Ver todas as perguntas
              </button>
            </div>
          </div>

          {/* Seja parceiro CTA */}
          <Link
            to="/seja-um-parceiro"
            className="flex items-center justify-between gap-2 rounded-lg border border-orange-500/30 px-3 py-2.5 hover:border-orange-400 transition"
            style={{ background: "linear-gradient(135deg,rgba(10,79,227,.15),rgba(255,106,0,.15))" }}
          >
            <span className="flex items-center gap-2 text-xs">
              <Store size={14} className="text-orange-300" />
              <span className="font-semibold text-slate-100">Quer vender no Grupo GF?</span>
            </span>
            <span className="text-[11px] font-semibold text-white px-2.5 py-1 rounded-full" style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
              Seja parceiro
            </span>
          </Link>

          {/* Identidade */}
          <div className="text-center pt-2 border-t border-cyan-500/10 space-y-1">
            <p className="font-bold text-sm text-cyan-400">GRUPO GF REDE VAREJISTA</p>
            <p className="text-xs text-slate-300">CNPJ {settings.cnpj}</p>
            <p className="text-xs text-slate-300">{settings.owner}</p>
            {settings.whatsapp && <p className="text-xs text-slate-400">WhatsApp: {settings.whatsapp}</p>}
            <p className="text-xs text-slate-500 pt-1">© 2026 Todos os direitos reservados</p>
          </div>
        </div>
      </footer>



      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-cyan-500/10 grid grid-cols-5" style={{ background: "#0f1d32" }}>
        {[
          { t: "home", label: "Início", icon: HomeIcon },
          { t: "categories", label: "Categorias", icon: Grid },
          { t: "cart", label: "Carrinho", icon: ShoppingCart, badge: cartCount },
          { t: "orders", label: "Pedidos", icon: Package },
          { t: "profile", label: "Perfil", icon: User },
        ].map(b => (
          <button key={b.t} onClick={() => setTab(b.t as Tab)}
            className={`py-2.5 flex flex-col items-center gap-1 text-[10px] relative ${tab === b.t ? "text-cyan-400" : "text-slate-400"}`}>
            <b.icon size={20} />
            {b.label}
            {b.badge && b.badge > 0 ? (
              <span className="absolute top-1 right-[28%] bg-red-500 text-white text-[9px] min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
                {b.badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {/* Product modal */}
      {productModal && (
        <ProductModal product={productModal} onClose={() => setProductModal(null)}
          onAdd={() => { addToCart(productModal.id); setProductModal(null); }}
          isFav={user?.favorites.includes(productModal.id) ?? false}
          onFav={() => toggleFavorite(productModal.id)}
          user={user} orders={orders}
          allProducts={products}
          onOpenProduct={(p) => setProductModal(p)} />
      )}


      {/* Checkout modal: delivery info before payment */}
      {checkoutOpen && (
        <>
          <div className="fixed inset-0 bg-black/70 z-[990]" onClick={() => !mpLoading && setCheckoutOpen(false)} />
          <div className="fixed inset-0 z-[995] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
            <form onSubmit={submitCheckout}
              className="pointer-events-auto w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-[#0f1d32] sm:rounded-2xl rounded-t-2xl border border-cyan-500/20 p-5 space-y-3">
              <div className="flex items-center justify-between sticky top-0 -mx-5 -mt-5 px-5 pt-5 pb-3 bg-[#0f1d32] border-b border-white/5 z-10">
                <h3 className="font-bold text-lg">Dados de entrega</h3>
                <button type="button" onClick={() => setCheckoutOpen(false)} disabled={mpLoading}
                  className="p-1.5 rounded hover:bg-white/10"><X size={18} /></button>
              </div>

              <p className="text-xs font-semibold text-cyan-300 uppercase">Quem está comprando</p>
              <div className="grid grid-cols-2 gap-2">
                <input required maxLength={120} placeholder="Seu nome*" value={delivery.customerName}
                  onChange={e => setDelivery(d => ({ ...d, customerName: e.target.value }))}
                  className="col-span-2 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input required maxLength={30} placeholder="Telefone/WhatsApp*" value={delivery.customerPhone}
                  onChange={e => setDelivery(d => ({ ...d, customerPhone: e.target.value }))}
                  className="bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input type="email" maxLength={255} placeholder="Email (opcional)" value={delivery.customerEmail}
                  onChange={e => setDelivery(d => ({ ...d, customerEmail: e.target.value }))}
                  className="bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
              </div>

              <p className="text-xs font-semibold text-orange-300 uppercase pt-2">Quem vai receber</p>
              <div className="grid grid-cols-2 gap-2">
                <input required maxLength={120} placeholder="Nome do destinatário*" value={delivery.recipientName}
                  onChange={e => setDelivery(d => ({ ...d, recipientName: e.target.value }))}
                  className="col-span-2 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input required maxLength={30} placeholder="Telefone do destinatário*" value={delivery.recipientPhone}
                  onChange={e => setDelivery(d => ({ ...d, recipientPhone: e.target.value }))}
                  className="col-span-2 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
              </div>

              <p className="text-xs font-semibold text-orange-300 uppercase pt-2">Endereço de entrega</p>
              <div className="grid grid-cols-3 gap-2">
                <input required maxLength={15} placeholder="CEP*" value={delivery.zip}
                  onChange={e => setDelivery(d => ({ ...d, zip: e.target.value }))}
                  className="bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input required maxLength={200} placeholder="Rua*" value={delivery.street}
                  onChange={e => setDelivery(d => ({ ...d, street: e.target.value }))}
                  className="col-span-2 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input required maxLength={20} placeholder="Nº*" value={delivery.number}
                  onChange={e => setDelivery(d => ({ ...d, number: e.target.value }))}
                  className="bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input maxLength={120} placeholder="Complemento" value={delivery.complement}
                  onChange={e => setDelivery(d => ({ ...d, complement: e.target.value }))}
                  className="col-span-2 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input required maxLength={120} placeholder="Bairro*" value={delivery.neighborhood}
                  onChange={e => setDelivery(d => ({ ...d, neighborhood: e.target.value }))}
                  className="col-span-3 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input required maxLength={120} placeholder="Cidade*" value={delivery.city}
                  onChange={e => setDelivery(d => ({ ...d, city: e.target.value }))}
                  className="col-span-2 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input required maxLength={60} placeholder="UF*" value={delivery.state}
                  onChange={e => setDelivery(d => ({ ...d, state: e.target.value.toUpperCase() }))}
                  className="bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <input maxLength={255} placeholder="Ponto de referência" value={delivery.reference}
                  onChange={e => setDelivery(d => ({ ...d, reference: e.target.value }))}
                  className="col-span-3 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm" />
                <textarea maxLength={1000} placeholder="Observações (opcional)" value={delivery.notes}
                  onChange={e => setDelivery(d => ({ ...d, notes: e.target.value }))}
                  className="col-span-3 bg-[#162340] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm min-h-[60px]" />
              </div>

              <div className="bg-[#162340] border border-cyan-500/10 rounded-lg p-3 text-sm flex justify-between font-bold">
                <span>Total a pagar</span><span className="text-cyan-300">{brl(total)}</span>
              </div>

              <button type="submit" disabled={mpLoading}
                className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#00b1ea,#2d3277)" }}>
                <CreditCard size={18} /> {mpLoading ? "Redirecionando para o Mercado Pago..." : "Confirmar e ir para pagamento"}
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                Você será levado ao Mercado Pago para pagar com Cartão, Pix ou Boleto.
              </p>
            </form>
          </div>
        </>
      )}

      <style>{`@keyframes slideDown { from { opacity:0; transform: translate(-50%, -20px); } to { opacity:1; transform: translate(-50%, 0); } }`}</style>
    </div>
  );
}

/* ---------- Register ---------- */
/* ---------- Welcome ---------- */
function WelcomeScreen() {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center px-6" style={{ background: "#0a1628" }}>
      <div className="w-full max-w-sm text-center">
        <img src={logo} alt="Grupo GF" className="w-24 h-24 mx-auto mb-4 rounded-2xl bg-white p-1.5" />
        <h1 className="font-bold text-2xl text-white">GRUPO GF</h1>
        <p className="text-xs tracking-[0.3em] text-orange-400 font-semibold">REDE VAREJISTA</p>
        <p className="text-sm mt-2 text-slate-400 mb-8">Escolha como deseja entrar</p>
        <div className="space-y-3">
          <a href="/auth?tipo=lojista" className="block w-full py-3 rounded-lg font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#0a4fe3,#1e90ff)" }}>
            Sou Lojista (Atacado)
          </a>
          <a href="/auth?tipo=pessoa_fisica" className="block w-full py-3 rounded-lg font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#ff6a00,#ff3d3d)" }}>
            Sou Pessoa Física
          </a>
          <a href="/auth" className="block text-sm text-cyan-300 mt-4 underline">Já tenho conta — Entrar</a>
        </div>
      </div>
    </div>
  );
}

/* ---------- Register (legado, não usado) ---------- */
function RegisterScreen({ onRegister }: { onRegister: (u: UserData) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !email) { setErr("Preencha todos os campos."); return; }
    if (pin && !/^\d{4,6}$/.test(pin)) { setErr("PIN deve ter 4 a 6 dígitos."); return; }
    onRegister({ name, phone, email, pin, favorites: [] });
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center px-6" style={{ background: "#0a1628" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src={logo} alt="Grupo GF" className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-white p-1.5" />
          <h1 className="font-bold text-xl text-white">GRUPO GF</h1>
          <p className="text-xs tracking-[0.3em] text-orange-400 font-semibold">REDE VAREJISTA</p>
          <p className="text-sm mt-1 text-slate-400">Bem-vindo à nossa loja</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {err && <p className="text-red-400 text-sm text-center">{err}</p>}
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3.5 py-2.5 text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-400"
            placeholder="Seu nome completo" />
          <input value={phone} onChange={e => setPhone(e.target.value)} required
            className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3.5 py-2.5 text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-400"
            placeholder="Telefone (DDD + número)" />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
            className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3.5 py-2.5 text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-400"
            placeholder="E-mail" />
          <input value={pin} onChange={e => setPin(e.target.value)} type="password" maxLength={6}
            className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3.5 py-2.5 text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-400"
            placeholder="PIN (4-6 dígitos, opcional)" />
          <button type="submit" className="w-full py-3 rounded-lg font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
            Cadastrar / Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---------- Product Card ---------- */
function ProductCard({ product, onOpen, onAdd, isFav, onFav }: {
  product: Product; onOpen: () => void; onAdd: () => void; isFav: boolean; onFav: () => void;
}) {
  // Pseudo-rating derived from product id so the UI feels alive even before real reviews load
  const seed = product.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const rating = 3.8 + ((seed % 13) / 10); // 3.8 - 5.0
  const ratingCount = 12 + (seed % 180);
  const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
  const lowStock = product.stock > 0 && product.stock <= 5;

  return (
    <div className="card-premium group overflow-hidden flex flex-col hover:-translate-y-0.5 transition-transform">
      <div className="relative cursor-pointer overflow-hidden" onClick={onOpen}>
        <img src={product.image || fallbackProductImage} alt={product.name}
          className="w-full h-36 object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
          <div className="flex flex-col gap-1">
            {discount > 0 && (
              <span className="bg-gradient-warm text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-elegant">
                -{discount}%
              </span>
            )}
            {lowStock && (
              <span className="bg-amber-500/95 text-amber-950 text-[10px] font-bold px-2 py-0.5 rounded-md">
                Últimas {product.stock}
              </span>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); onFav(); }}
            aria-label="Favoritar"
            className="w-8 h-8 rounded-full bg-black/55 backdrop-blur flex items-center justify-center hover:bg-black/75 transition">
            <Heart size={16} className={isFav ? "fill-red-500 text-red-500" : "text-white"} />
          </button>
        </div>
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <p className="text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem] text-slate-100">{product.name}</p>
        <div className="flex items-center gap-1 mt-1">
          {[1, 2, 3, 4, 5].map(i => (
            <Star key={i} size={11}
              className={i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-slate-600"} />
          ))}
          <span className="text-[10px] text-slate-400 ml-0.5">{rating.toFixed(1)} ({ratingCount})</span>
        </div>
        <div className="mt-1">
          <CompraSeguraTag />
        </div>
        <div className="mt-auto pt-2">
          {product.oldPrice && <p className="text-[11px] text-slate-500 line-through">{brl(product.oldPrice)}</p>}
          <p className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400 font-extrabold text-lg leading-tight">{brl(product.price)}</p>
          <button onClick={onAdd}
            className="btn-premium mt-2 w-full py-1.5 text-xs flex items-center justify-center gap-1 hover:brightness-110 active:scale-[0.98] transition">
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}


/* ---------- Product Modal ---------- */
type Review = {
  id: string; product_id: string; user_id: string; user_name: string;
  rating: number; comment: string; photos: string[]; videos: string[]; created_at: string;
};

function ProductModal({ product, onClose, onAdd, isFav, onFav, user, orders, allProducts, onOpenProduct }: {
  product: Product; onClose: () => void; onAdd: () => void; isFav: boolean; onFav: () => void;
  user: UserData | null; orders: Order[];
  allProducts: Product[]; onOpenProduct: (p: Product) => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Elegibilidade: usuário logado com pedido entregue contendo este produto (match por nome)
  const eligible = useMemo(() => {
    if (!user) return false;
    return orders.some(o => o.status === "Entregue" && o.items.some(it => it.name === product.name));
  }, [user, orders, product.name]);

  const myReviewExists = useMemo(() => {
    if (!user) return false;
    return reviews.some(r => r.user_name === user.name);
  }, [reviews, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", product.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        const rows = (((data as unknown) as Review[]) ?? []);
        const sign = async (path: string) => {
          if (/^https?:\/\//.test(path)) return path;
          const { data: signedUrl } = await supabase.storage.from("review-photos").createSignedUrl(path, 60 * 60);
          return signedUrl?.signedUrl ?? path;
        };
        const resolved = await Promise.all(rows.map(async (review) => {
          const photos = await Promise.all((review.photos ?? []).map(sign));
          const videos = await Promise.all((((review as any).videos as string[]) ?? []).map(sign));
          return { ...review, photos, videos };
        }));
        setReviews(resolved);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [product.id]);

  const avgRating = reviews.length === 0 ? 0 : reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4);
    setPhotoFiles(files);
  };

  const handleVideoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 2);
    setVideoFiles(files);
  };

  const submitReview = async () => {
    if (!user) return;
    setErr(null); setSubmitting(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Faça login novamente.");

      const photoUrls: string[] = [];
      for (const file of photoFiles) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${uid}/${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("review-photos").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        photoUrls.push(path);
      }

      const videoUrls: string[] = [];
      for (const file of videoFiles) {
        if (file.size > 30 * 1024 * 1024) throw new Error("Vídeo muito grande (máx. 30MB).");
        const ext = file.name.split(".").pop() || "mp4";
        const path = `${uid}/${product.id}-vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("review-photos").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        videoUrls.push(path);
      }

      let inserted: any = null;
      let insErr: any = null;
      ({ data: inserted, error: insErr } = await (supabase as any)
        .from("product_reviews")
        .insert({
          product_id: product.id,
          user_id: uid,
          user_name: user.name,
          rating, comment, photos: photoUrls, videos: videoUrls,
        })
        .select()
        .single());
      if (insErr && /videos/i.test(insErr.message || "")) {
        // Banco ainda sem a coluna de vídeos — salva sem vídeos
        ({ data: inserted, error: insErr } = await (supabase as any)
          .from("product_reviews")
          .insert({ product_id: product.id, user_id: uid, user_name: user.name, rating, comment, photos: photoUrls })
          .select()
          .single());
      }
      if (insErr) throw insErr;

      const sign = async (path: string) => {
        const { data: signedUrl } = await supabase.storage.from("review-photos").createSignedUrl(path, 60 * 60);
        return signedUrl?.signedUrl ?? path;
      };
      const visiblePhotos = await Promise.all(photoUrls.map(sign));
      const visibleVideos = await Promise.all(videoUrls.map(sign));
      setReviews(prev => [{ ...((inserted as unknown) as Review), photos: visiblePhotos, videos: visibleVideos }, ...prev]);
      setShowForm(false); setRating(5); setComment(""); setPhotoFiles([]); setVideoFiles([]);
    } catch (e: any) {
      setErr(e?.message || "Erro ao enviar avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-[#0a1628] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="bg-[#0f1d32] min-h-screen w-full">
        <div className="relative">
          <img src={product.image} alt="" className="w-full aspect-square object-cover" />
          <button onClick={onClose} className="absolute top-4 left-4 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center backdrop-blur">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 pb-28">
          <p className="text-xs text-cyan-400 font-semibold">{product.category}</p>
          <h3 className="font-bold text-lg mt-1">{product.name}</h3>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#162340] border border-cyan-500/15 px-3 py-2">
            <Store size={16} className="text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Vendido por</div>
              <div className="text-sm font-semibold text-white truncate">{product.sellerName || "GRUPO GF REDE VAREJISTA"}</div>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            {product.oldPrice && <span className="text-sm text-slate-500 line-through">{brl(product.oldPrice)}</span>}
            <span className="text-2xl font-bold text-cyan-400">{brl(product.price)}</span>
          </div>
          {reviews.length > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#162340] border border-cyan-500/15 px-3 py-2">
              <div className="flex items-center gap-0.5">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} size={15} className={i <= Math.round(avgRating) ? "fill-yellow-400 text-yellow-400" : "text-slate-600"} />
                ))}
              </div>
              <span className="text-sm font-bold text-yellow-300">{avgRating.toFixed(1)}/5</span>
              <span className="text-xs text-slate-400">· {reviews.length.toLocaleString("pt-BR")} {reviews.length === 1 ? "avaliação" : "avaliações"}</span>
            </div>
          )}
          {product.variants && product.variants.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Variações</div>
              <div className="flex flex-wrap gap-2">
                {product.variants.map(v => {
                  const label = v.name || [v.attributes?.color, v.attributes?.size].filter(Boolean).join(" ") || "Variação";
                  const vPrice = v.discount_price ?? v.price;
                  return (
                    <div key={v.id} className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-[#162340] px-2.5 py-1.5">
                      {v.image_url && <img src={v.image_url} alt="" className="h-8 w-8 rounded object-cover" />}
                      <div className="text-xs">
                        <div className="font-semibold text-white">{label}</div>
                        <div className="text-cyan-300">{brl(Number(vPrice) || 0)} <span className="text-slate-400">· {v.stock} un.</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {product.description && <p className="text-sm text-slate-300 mt-3">{product.description}</p>}
          {product.notes && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="text-[11px] uppercase tracking-wide text-amber-300 mb-1 font-semibold">Notas do vendedor</div>
              <p className="text-xs text-amber-100 whitespace-pre-line">{product.notes}</p>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-3">Estoque: {product.stock} unidades</p>
          <div className="flex gap-2 mt-5">
            <button onClick={onFav} className="px-4 py-2.5 rounded-lg border border-cyan-500/30">
              <Heart size={18} className={isFav ? "fill-red-500 text-red-500" : ""} />
            </button>
            <button onClick={onAdd}
              className="flex-1 py-2.5 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
              <ShoppingCart size={18} /> Adicionar ao carrinho
            </button>
          </div>

          {/* Chat com o vendedor */}
          <ChatButton productId={product.id} productName={product.name} sellerName={product.sellerName || "GRUPO GF"} />

          {/* Selo Compra Segura GF */}
          <CompraSeguraSeal />

          {/* Avaliações */}
          <div className="mt-6 pt-5 border-t border-cyan-500/10">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm flex items-center gap-2"><Star size={16} className="text-yellow-400" /> Avaliações</h4>
              {eligible && !myReviewExists && !showForm && (
                <button onClick={() => setShowForm(true)} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Avaliar
                </button>
              )}
            </div>

            {!user && (
              <p className="text-xs text-slate-400 mb-3">Faça login para avaliar este produto.</p>
            )}
            {user && !eligible && (
              <p className="text-xs text-slate-400 mb-3">Apenas clientes que receberam este produto podem avaliar.</p>
            )}
            {user && eligible && myReviewExists && !showForm && (
              <p className="text-xs text-emerald-400 mb-3">✓ Você já avaliou este produto.</p>
            )}

            {showForm && (
              <div className="bg-[#162340] border border-cyan-500/20 rounded-xl p-3 mb-4 space-y-3">
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(i => (
                    <button key={i} onClick={() => setRating(i)} type="button">
                      <Star size={24} className={i <= rating ? "fill-yellow-400 text-yellow-400" : "text-slate-600"} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Conte como foi sua experiência..."
                  maxLength={500}
                  className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg p-2 text-sm min-h-[80px]"
                />
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-cyan-400 cursor-pointer">
                    <Upload size={14} /> Adicionar fotos (até 4)
                    <input type="file" accept="image/*" multiple hidden onChange={handlePhotoPick} />
                  </label>
                  {photoFiles.length > 0 && (
                    <p className="text-[10px] text-slate-400">{photoFiles.length} foto(s) selecionada(s)</p>
                  )}
                  <label className="flex items-center gap-2 text-xs text-cyan-400 cursor-pointer">
                    <Camera size={14} /> Adicionar vídeos curtos (até 2, máx. 30MB)
                    <input type="file" accept="video/*" multiple hidden onChange={handleVideoPick} />
                  </label>
                  {videoFiles.length > 0 && (
                    <p className="text-[10px] text-slate-400">{videoFiles.length} vídeo(s) selecionado(s)</p>
                  )}
                </div>
                {err && <p className="text-xs text-red-400">{err}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setShowForm(false); setErr(null); }} className="flex-1 py-2 rounded-lg border border-slate-600 text-xs">Cancelar</button>
                  <button onClick={submitReview} disabled={submitting || !comment.trim()}
                    className="flex-1 py-2 rounded-lg bg-cyan-500 text-[#0a1628] font-semibold text-xs disabled:opacity-50">
                    {submitting ? "Enviando..." : "Publicar"}
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-xs text-slate-400">Carregando...</p>
            ) : reviews.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma avaliação ainda. Seja o primeiro!</p>
            ) : (
              <div className="space-y-3">
                {reviews.map(r => (
                  <div key={r.id} className="bg-[#162340] border border-cyan-500/10 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold">{r.user_name || "Cliente"}</p>
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map(i => (
                          <Star key={i} size={12} className={i <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-600"} />
                        ))}
                      </div>
                    </div>
                    {r.comment && <p className="text-xs text-slate-300 mb-2">{r.comment}</p>}
                    {r.photos.length > 0 && (
                      <div className="flex gap-1 overflow-x-auto">
                        {r.photos.map((url, i) => (
                          <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded" />
                        ))}
                      </div>
                    )}
                    {(r.videos?.length ?? 0) > 0 && (
                      <div className="flex gap-1 overflow-x-auto mt-1">
                        {r.videos.map((url, i) => (
                          <video key={i} src={url} controls preload="metadata" className="w-32 h-20 rounded bg-black object-cover" />
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1">{new Date(r.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Produtos do mesmo vendedor */}
          {(() => {
            const sameSeller = allProducts.filter(p =>
              p.id !== product.id &&
              ((product.partnerId && p.partnerId === product.partnerId) ||
               (!product.partnerId && !p.partnerId && p.sellerName === product.sellerName))
            ).slice(0, 12);
            if (sameSeller.length === 0) return null;
            return (
              <div className="mt-6 pt-5 border-t border-cyan-500/10">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Store size={16} className="text-cyan-400" /> Produtos do Mesmo Vendedor
                  </h4>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 snap-x">
                  {sameSeller.map(sp => (
                    <button
                      key={sp.id}
                      onClick={() => onOpenProduct(sp)}
                      className="snap-start shrink-0 w-32 text-left bg-[#162340] border border-cyan-500/15 rounded-lg overflow-hidden hover:border-cyan-400/40 transition"
                    >
                      <div className="aspect-square bg-[#0a1628]">
                        <img src={sp.image} alt={sp.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2">
                        <p className="text-[11px] text-white line-clamp-2 leading-tight min-h-[28px]">{sp.name}</p>
                        <p className="mt-1 text-sm font-bold text-cyan-400">{brl(sp.price)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/* ---------- Profile ---------- */
function WalletInline() {
  const fetchWallet = useServerFn(getWallet);
  const [data, setData] = useState<{ available: number; pending: number; cashback: number } | null>(null);
  useEffect(() => {
    let active = true;
    fetchWallet().then((r: any) => {
      if (!active) return;
      const w = r?.wallet ?? {};
      setData({
        available: Number(w.available_balance ?? 0),
        pending: Number(w.pending_balance ?? 0),
        cashback: Number(w.total_cashback ?? 0),
      });
    }).catch(() => active && setData({ available: 0, pending: 0, cashback: 0 }));
    return () => { active = false; };
  }, [fetchWallet]);

  return (
    <div className="space-y-3">
      <Link to="/carteira" className="block rounded-2xl p-4 border border-cyan-500/15 bg-[#0f1d32] shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#6d28d9,#4f46e5)" }}>
            <Wallet size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white">Carteira GF</span>
              <Eye size={14} className="text-slate-400" />
            </div>
            <div className="text-xs text-slate-400">Saldo disponível</div>
            <div className="text-2xl font-bold text-white mt-0.5 leading-tight">
              {data ? brl(data.available) : "R$ ..."}
            </div>
          </div>
          <ChevronRight size={20} className="text-slate-500 mt-1" />
        </div>
        <div className="border-t border-cyan-500/10 mt-3 pt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] text-slate-400">Pendente</div>
            <div className="font-bold text-orange-400 text-sm">{data ? brl(data.pending) : "—"}</div>
            <div className="text-[10px] text-slate-500">A liberar</div>
          </div>
          <div className="border-x border-cyan-500/10">
            <div className="text-[11px] text-slate-400">Cashback</div>
            <div className="font-bold text-emerald-400 text-sm">{data ? brl(data.cashback) : "—"}</div>
            <div className="text-[10px] text-slate-500">Disponível</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Total</div>
            <div className="font-bold text-cyan-400 text-sm">{data ? brl(data.available + data.pending + data.cashback) : "—"}</div>
            <div className="text-[10px] text-slate-500">Somatório</div>
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-4 gap-2">
        {[
          { to: "/carteira", icon: ArrowDownToLine, label: "Depositar", sub: "via PIX", bg: "rgba(16,185,129,0.15)", color: "#10b981" },
          { to: "/carteira", icon: ArrowUpFromLine, label: "Sacar", sub: "via PIX", bg: "rgba(244,63,94,0.15)", color: "#f43f5e" },
          { to: "/carteira", icon: ArrowLeftRight, label: "Transferir", sub: "via PIX", bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
          { to: "/wallet/transactions", icon: FileText, label: "Extrato", sub: "ver lançamentos", bg: "rgba(234,179,8,0.15)", color: "#eab308" },
        ].map((a) => (
          <Link key={a.label} to={a.to}
            className="rounded-xl p-2.5 bg-[#0f1d32] border border-cyan-500/10 text-center flex flex-col items-center gap-1">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: a.bg }}>
              <a.icon size={18} style={{ color: a.color }} />
            </div>
            <div className="text-[11px] font-semibold text-white leading-tight">{a.label}</div>
            <div className="text-[9px] text-slate-400 leading-tight">{a.sub}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProfileTab({ user, setUser, orders, products, onOpenProduct, onGoFaq, onGoFavorites, onGoCashback, onGoNotifications, cashbackAvailable, unreadNotifs, showToast, isOwner, onGoAdmin, onSignOut }: {
  user: UserData; setUser: (u: UserData | null) => void;
  orders: Order[]; products: Product[];
  onOpenProduct: (p: Product) => void;
  onGoFaq: () => void;
  onGoFavorites: () => void;
  onGoCashback: () => void;
  onGoNotifications: () => void;
  cashbackAvailable: number;
  unreadNotifs: number;
  showToast: (m: string) => void;
  isOwner?: boolean;
  onGoAdmin?: () => void;
  onSignOut: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const totalSpent = orders.reduce((s, o) => s + o.total, 0);
  const favs = products.filter(p => user.favorites.includes(p.id));

  const [openInfo, setOpenInfo] = useState(false);
  const [openSecurity, setOpenSecurity] = useState(false);
  const [openAddresses, setOpenAddresses] = useState(false);
  const [openAbout, setOpenAbout] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openFavs, setOpenFavs] = useState(false);


  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const data = await fileToDataUrl(file);
    setUser({ ...user, avatar: data });
    showToast("Foto atualizada");
  };

  const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=06b6d4`;

  const signOut = () => { void onSignOut(); };

  return (
    <div className="pb-6">
      {/* Header banner */}
      <div className="relative px-4 pt-6 pb-8 text-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f1d32 0%, #1e3a5f 100%)" }}>
        {/* Logo de capa atrás da foto */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <img src={logo} alt="" aria-hidden
            className="w-[120%] max-w-none object-contain opacity-15 blur-[1px] select-none" />
        </div>
        <div className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(15,29,50,0.35) 0%, rgba(30,58,95,0.55) 100%)" }} />
        <div className="relative w-24 h-24 mx-auto mb-3">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-cyan-400 cursor-pointer"
            onClick={() => fileRef.current?.click()}>
            <img src={user.avatar || defaultAvatar} alt="" className="w-full h-full object-cover" />
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-cyan-400 text-[#0a1628] flex items-center justify-center shadow-lg">
            <Camera size={15} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
        </div>
        <p className="relative font-bold text-lg">{user.name}</p>
        <p className="relative text-sm text-slate-300">{user.email}</p>
      </div>

      {/* Carteira GF — aberta sob a foto de perfil */}
      <div className="px-4 -mt-3">
        <WalletInline />
      </div>

      {/* Stats */}
      <div className="px-4 -mt-4 mb-2">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Pedidos" val={String(orders.length)} color="#06b6d4" />
          <Stat label="Gasto" val={brl(totalSpent)} color="#10b981" />
          <Stat label="Favoritos" val={String(favs.length)} color="#3b82f6" />
        </div>
      </div>

      {/* Cashback highlight */}
      <div className="px-4 mt-3">
        <button onClick={onGoCashback}
          className="w-full rounded-2xl p-4 text-left text-white flex items-center gap-3 shadow-lg"
          style={{ background: "linear-gradient(135deg,#0a4fe3,#22d3ee)" }}>
          <Gift size={28} />
          <div className="flex-1">
            <p className="text-xs opacity-90 font-semibold">MEU CASHBACK</p>
            <p className="text-xl font-bold">{brl(cashbackAvailable)}</p>
            <p className="text-[11px] opacity-90">10% de volta · validade de 30 dias · use em compras</p>
          </div>
        </button>
      </div>

      {/* Menu list */}
      <div className="bg-[#0f1d32] mt-4 divide-y divide-cyan-500/10 border-y border-cyan-500/10">
        {isOwner && onGoAdmin && (
          <MenuRow icon={Shield} label="Administração"
            desc="Painel administrativo da loja"
            onClick={onGoAdmin} />
        )}
        <MenuRow icon={IdCard} label="Informações do seu perfil"
          desc="Nome, telefone, CPF, nascimento"
          onClick={() => setOpenInfo(true)} />
        <MenuRow icon={Shield} label="Segurança"
          desc="Alterar e-mail, senha e foto"
          onClick={() => setOpenSecurity(true)} />
        <MenuRow icon={MapPin} label="Endereços"
          desc="Salve seus endereços de entrega"
          onClick={() => setOpenAddresses(true)} />
        <MenuRow icon={Heart} label="Meus favoritos"
          desc={favs.length ? `${favs.length} ${favs.length === 1 ? "produto" : "produtos"} salvos` : "Nenhum favorito ainda"}
          onClick={onGoFavorites} />
        <MenuRow icon={Bell} label="Notificações"
          desc={unreadNotifs ? `${unreadNotifs} não lida${unreadNotifs > 1 ? "s" : ""}` : "Avisos de pedidos, cupons e cashback"}
          onClick={onGoNotifications} />
        <MenuRow icon={Gift} label="Meu cashback"
          desc={`Saldo disponível: ${brl(cashbackAvailable)}`}
          onClick={onGoCashback} />
        <MenuRow icon={HelpCircle} label="Perguntas frequentes"
          desc="Tire suas dúvidas sobre o app"
          onClick={onGoFaq} />
        <MenuRow icon={Star} label="Sobre nós"
          desc="Conheça a história do Grupo GF"
          onClick={() => setOpenAbout(true)} />
        <Link to="/carteira" className="block">
          <MenuRow icon={Wallet} label="Minha Carteira GF"
            desc="Saldo, PIX, extrato e saques" onClick={() => {}} />
        </Link>
        <Link to="/indique-e-ganhe" className="block">
          <MenuRow icon={Gift} label="Indique e Ganhe"
            desc="Convide amigos e ganhe R$ 5 na Carteira GF"
            onClick={() => {}} />
        </Link>
        <Link to="/seja-um-parceiro" className="block">
          <MenuRow icon={Store} label="Seja um Parceiro GF"
            desc="Cadastre sua loja e venda na plataforma"
            onClick={() => {}} />
        </Link>

      </div>


      {/* Danger zone */}
      <div className="bg-[#0f1d32] mt-4 divide-y divide-red-500/10 border-y border-red-500/10">
        <MenuRow icon={Trash2} label="Excluir conta"
          desc="Apagar permanentemente seus dados"
          danger
          onClick={() => setOpenDelete(true)} />
        <MenuRow icon={LogOut} label="Sair"
          desc="Encerrar a sessão neste dispositivo"
          danger
          onClick={signOut} />
      </div>

      {openInfo && <ProfileInfoModal user={user} setUser={setUser} onClose={() => setOpenInfo(false)} />}
      {openSecurity && <SecurityModal user={user} setUser={setUser} onClose={() => setOpenSecurity(false)} showToast={showToast} />}
      {openAddresses && <AddressesModal onClose={() => setOpenAddresses(false)} showToast={showToast} />}
      {openAbout && <AboutModal onClose={() => setOpenAbout(false)} />}
      {openDelete && <DeleteAccountModal user={user} onClose={() => setOpenDelete(false)} />}
      {openFavs && (
        <div className="fixed inset-0 z-[1100] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpenFavs(false)}>
          <div className="bg-[#0f1d32] rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <ModalHeader title="Meus favoritos" onClose={() => setOpenFavs(false)} icon={Heart} />
            <div className="p-4">
              {favs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Nenhum favorito ainda.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {favs.map(p => (
                    <button key={p.id} onClick={() => { setOpenFavs(false); onOpenProduct(p); }}
                      className="bg-[#162340] border border-cyan-500/10 rounded-lg overflow-hidden">
                      <img src={p.image} alt="" className="w-full h-20 object-cover" />
                      <p className="text-[10px] p-1 truncate">{p.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuRow({ icon: Icon, label, desc, onClick, danger, badge }: {
  icon: any; label: string; desc?: string; onClick: () => void; danger?: boolean; badge?: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${danger ? "bg-red-500/15 text-red-400" : "bg-cyan-500/15 text-cyan-400"}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${danger ? "text-red-300" : "text-white"}`}>{label}</p>
        {desc && <p className="text-xs text-slate-400 truncate">{desc}</p>}
      </div>
      {badge}
      <span className="text-slate-500 text-lg">›</span>
    </button>
  );
}

function ModalHeader({ title, onClose, icon: Icon }: { title: string; onClose: () => void; icon: any }) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-cyan-500/10 sticky top-0 bg-[#0f1d32] z-10">
      <h3 className="font-bold text-base flex items-center gap-2">
        <Icon size={18} className="text-cyan-400" />
        {title}
      </h3>
      <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center">
        <X size={16} />
      </button>
    </div>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[1100] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[#0f1d32] rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ProfileInfoModal({ user, setUser, onClose }: { user: UserData; setUser: (u: UserData) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: user.name, phone: user.phone, cpf: user.cpf || "",
    birthdate: user.birthdate || "", address: user.address || "",
  });
  const save = () => { setUser({ ...user, ...form }); onClose(); };
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Informações do perfil" onClose={onClose} icon={IdCard} />
      <div className="p-4 space-y-3">
        {[
          { k: "name" as const, label: "Nome completo", type: "text" },
          { k: "phone" as const, label: "Telefone / WhatsApp", type: "tel" },
          { k: "cpf" as const, label: "CPF", type: "text" },
          { k: "birthdate" as const, label: "Data de nascimento", type: "date" },
          { k: "address" as const, label: "Endereço principal", type: "text" },
        ].map(f => (
          <div key={f.k}>
            <label className="text-xs text-slate-400 mb-1 block">{f.label}</label>
            <input type={f.type} value={form[f.k]} onChange={e => setForm({ ...form, [f.k]: e.target.value })}
              className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
          </div>
        ))}
        <button onClick={save}
          className="w-full py-2.5 rounded-lg bg-cyan-500 text-[#0a1628] font-semibold text-sm mt-2">
          Salvar alterações
        </button>
      </div>
    </ModalShell>
  );
}

function SecurityModal({ user, setUser, onClose, showToast }: {
  user: UserData; setUser: (u: UserData) => void; onClose: () => void; showToast: (m: string) => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const data = await fileToDataUrl(file);
    setUser({ ...user, avatar: data });
    showToast("Foto atualizada");
  };

  const changePassword = async () => {
    setMsg(null);
    if (newPassword.length < 6) return setMsg({ type: "err", text: "A senha deve ter pelo menos 6 caracteres." });
    if (newPassword !== confirmPassword) return setMsg({ type: "err", text: "As senhas não coincidem." });
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMsg({ type: "ok", text: "Senha alterada com sucesso!" });
      setNewPassword(""); setConfirmPassword("");
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message || "Erro ao alterar senha." });
    } finally { setBusy(false); }
  };

  const changeEmail = async () => {
    setMsg(null);
    if (!newEmail.includes("@")) return setMsg({ type: "err", text: "E-mail inválido." });
    if (newEmail === user.email) return setMsg({ type: "err", text: "Informe um novo e-mail." });
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setMsg({ type: "ok", text: "Solicitação de alteração de e-mail enviada." });
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message || "Erro ao alterar e-mail." });
    } finally { setBusy(false); }
  };

  const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=06b6d4`;

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Segurança" onClose={onClose} icon={Shield} />
      <div className="p-4 space-y-6">
        {/* Photo */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Camera size={14} className="text-cyan-400" /> Foto de perfil</h4>
          <div className="flex items-center gap-3">
            <img src={user.avatar || defaultAvatar} alt=""
              className="w-16 h-16 rounded-full object-cover border-2 border-cyan-400" />
            <div className="flex-1 flex gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex-1 py-2 px-3 rounded-lg bg-cyan-500 text-[#0a1628] font-semibold text-xs">
                Alterar foto
              </button>
              {user.avatar && (
                <button onClick={() => setUser({ ...user, avatar: undefined })}
                  className="py-2 px-3 rounded-lg border border-red-500/40 text-red-400 text-xs">
                  Remover
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
          </div>
        </div>

        <div className="pt-4 border-t border-cyan-500/10">
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Lock size={14} className="text-cyan-400" /> Alterar senha</h4>
          <div className="space-y-2">
            <input type="password" placeholder="Nova senha (mín. 6 caracteres)"
              value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            <input type="password" placeholder="Confirmar nova senha"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            <button onClick={changePassword} disabled={busy}
              className="w-full py-2.5 rounded-lg bg-cyan-500 text-[#0a1628] font-semibold text-sm disabled:opacity-50">
              {busy ? "Salvando..." : "Salvar nova senha"}
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-cyan-500/10">
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Mail size={14} className="text-cyan-400" /> Alterar e-mail</h4>
          <div className="space-y-2">
            <input type="email" placeholder="Novo e-mail"
              value={newEmail} onChange={e => setNewEmail(e.target.value)}
              className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            <button onClick={changeEmail} disabled={busy}
              className="w-full py-2.5 rounded-lg border border-cyan-500/40 text-cyan-300 text-sm disabled:opacity-50">
              {busy ? "Enviando..." : "Atualizar e-mail"}
            </button>
          </div>
        </div>

        {msg && (
          <p className={`text-xs ${msg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
        )}
      </div>
    </ModalShell>
  );
}

function AddressesModal({ onClose, showToast }: { onClose: () => void; showToast: (m: string) => void }) {
  const [list, setList] = useState<Address[]>(() => load<Address[]>(LS.addresses, []));
  const [editing, setEditing] = useState<Address | null>(null);

  const persist = (next: Address[]) => { setList(next); save(LS.addresses, next); };

  const emptyAddress = (): Address => ({
    id: uid(), label: "Casa", recipient: "", phone: "", zip: "",
    street: "", number: "", complement: "", neighborhood: "", city: "", state: "",
    reference: "", isDefault: list.length === 0,
  });

  const saveAddress = (a: Address) => {
    let next = list.find(x => x.id === a.id) ? list.map(x => x.id === a.id ? a : x) : [...list, a];
    if (a.isDefault) next = next.map(x => ({ ...x, isDefault: x.id === a.id }));
    persist(next);
    setEditing(null);
    showToast("Endereço salvo");
  };

  const remove = (id: string) => {
    if (!confirm("Remover este endereço?")) return;
    persist(list.filter(x => x.id !== id));
  };

  const setDefault = (id: string) => {
    persist(list.map(x => ({ ...x, isDefault: x.id === id })));
  };

  if (editing) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex items-center justify-between p-4 border-b border-cyan-500/10 sticky top-0 bg-[#0f1d32] z-10">
          <button onClick={() => setEditing(null)} className="text-cyan-400 text-sm">‹ Voltar</button>
          <h3 className="font-bold text-base flex items-center gap-2"><MapPin size={18} className="text-cyan-400" /> Endereço</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Identificação (ex: Casa, Trabalho)</label>
            <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })}
              className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Destinatário</label>
              <input value={editing.recipient} onChange={e => setEditing({ ...editing, recipient: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Telefone</label>
              <input value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">CEP</label>
              <input value={editing.zip} onChange={e => setEditing({ ...editing, zip: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Rua / Avenida</label>
              <input value={editing.street} onChange={e => setEditing({ ...editing, street: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Número</label>
              <input value={editing.number} onChange={e => setEditing({ ...editing, number: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Complemento</label>
              <input value={editing.complement} onChange={e => setEditing({ ...editing, complement: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Bairro</label>
              <input value={editing.neighborhood} onChange={e => setEditing({ ...editing, neighborhood: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Cidade</label>
              <input value={editing.city} onChange={e => setEditing({ ...editing, city: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">UF</label>
              <input maxLength={2} value={editing.state} onChange={e => setEditing({ ...editing, state: e.target.value.toUpperCase() })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Ponto de referência</label>
              <input value={editing.reference} onChange={e => setEditing({ ...editing, reference: e.target.value })}
                className="w-full bg-[#162340] border border-cyan-500/20 rounded-lg p-2.5 text-sm" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!editing.isDefault}
              onChange={e => setEditing({ ...editing, isDefault: e.target.checked })} />
            Usar como endereço padrão
          </label>
          <button onClick={() => saveAddress(editing)}
            className="w-full py-2.5 rounded-lg bg-cyan-500 text-[#0a1628] font-semibold text-sm">
            Salvar endereço
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Meus endereços" onClose={onClose} icon={MapPin} />
      <div className="p-4 space-y-3">
        {list.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Você ainda não cadastrou nenhum endereço.</p>
        )}
        {list.map(a => (
          <div key={a.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3">
            <div className="flex items-start gap-2 mb-2">
              <MapPin size={16} className="text-cyan-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{a.label}</p>
                  {a.isDefault && <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full">Padrão</span>}
                </div>
                <p className="text-xs text-slate-300">{a.recipient} · {a.phone}</p>
                <p className="text-xs text-slate-400 mt-1">{a.street}, {a.number}{a.complement ? ` - ${a.complement}` : ""}</p>
                <p className="text-xs text-slate-400">{a.neighborhood}, {a.city}/{a.state} · {a.zip}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setEditing(a)} className="flex-1 text-xs py-1.5 rounded border border-cyan-500/30 text-cyan-300">Editar</button>
              {!a.isDefault && (
                <button onClick={() => setDefault(a.id)} className="flex-1 text-xs py-1.5 rounded border border-emerald-500/30 text-emerald-300">Tornar padrão</button>
              )}
              <button onClick={() => remove(a.id)} className="text-xs py-1.5 px-3 rounded border border-red-500/30 text-red-300">Excluir</button>
            </div>
          </div>
        ))}
        <button onClick={() => setEditing(emptyAddress())}
          className="w-full py-2.5 rounded-lg bg-cyan-500 text-[#0a1628] font-semibold text-sm flex items-center justify-center gap-2">
          <Plus size={16} /> Adicionar novo endereço
        </button>
      </div>
    </ModalShell>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Sobre nós" onClose={onClose} icon={Star} />
      <div className="p-4 space-y-4 text-sm text-slate-300 leading-relaxed">
        <div className="flex justify-center mb-2">
          <img src={logo} alt="Grupo GF" className="h-16 w-16 rounded-xl object-contain bg-white/5 p-1" />
        </div>
        <h4 className="text-center font-bold text-cyan-400">GRUPO GF REDE VAREJISTA</h4>
        <p>
          O Grupo GF nasceu de um sonho simples e poderoso: oferecer produtos de qualidade,
          preço justo e atendimento humano para famílias de todo o Brasil. A história começou
          com uma família trabalhadora que acreditava que economia e qualidade podem caminhar
          juntas — e transformou esse propósito em um pequeno comércio, feito com muito esforço,
          atenção aos detalhes e atendimento olho no olho.
        </p>
        <p>
          A cada cliente conquistado, a confiança cresceu. O que começou pequeno se tornou uma
          rede varejista digital que hoje atende milhares de famílias em <span className="text-cyan-300 font-semibold">todo o território nacional</span>,
          com alimentos, bebidas, limpeza, higiene, eletrônicos, moda e muito mais — sempre com
          o mesmo cuidado dos primeiros dias.
        </p>
        <p>
          Em 2026 lançamos nosso aplicativo oficial para levar essa experiência para a palma da
          sua mão: comprar do sofá, falar com a gente pelo WhatsApp, acompanhar pedidos em tempo
          real e receber em casa, em qualquer canto do Brasil, com agilidade e segurança.
        </p>
        <p>
          Nossa missão continua a mesma desde o primeiro dia: <span className="text-cyan-300 font-semibold">facilitar
          o dia a dia das famílias brasileiras com produtos de qualidade, economia de verdade e
          atendimento próximo, em todo o Brasil.</span>
        </p>

        <div className="pt-2 border-t border-cyan-500/10 text-xs text-slate-400 space-y-1">
          <p><span className="text-slate-500">Razão Social:</span> Grupo GF Rede Varejista</p>
          <p><span className="text-slate-500">CNPJ:</span> 55.844.536/0001-85</p>
          <p><span className="text-slate-500">Responsável:</span> Ezequiel de Farias Carvalho</p>
        </div>
      </div>
    </ModalShell>
  );
}

function DeleteAccountModal({ user, onClose }: { user: UserData; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const remove = async () => {
    setErr(null);
    if (confirmText.trim().toUpperCase() !== "EXCLUIR") {
      setErr("Digite EXCLUIR para confirmar.");
      return;
    }
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.signOut();
    } catch {}
    try {
      localStorage.removeItem(LS.user);
      localStorage.removeItem(LS.addresses);
      localStorage.removeItem(LS.cart);
      localStorage.removeItem(LS.orders);
    } catch {}
    window.location.href = "/auth";
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Excluir conta" onClose={onClose} icon={Trash2} />
      <div className="p-4 space-y-3">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-200">
          <p className="font-semibold mb-1">Atenção: esta ação é permanente.</p>
          <p>Ao excluir sua conta <b>{user.email}</b>, seus dados, endereços, favoritos e histórico
          de pedidos locais serão removidos. Para apagar dados de pagamento ou anteriores ao app,
          fale com a gente pelo WhatsApp.</p>
        </div>
        <label className="text-xs text-slate-400 block">
          Digite <span className="text-red-300 font-semibold">EXCLUIR</span> para confirmar:
        </label>
        <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
          placeholder="EXCLUIR"
          className="w-full bg-[#162340] border border-red-500/30 rounded-lg p-2.5 text-sm" />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-cyan-500/30 text-cyan-200 text-sm">
            Cancelar
          </button>
          <button onClick={remove} disabled={busy}
            className="flex-1 py-2.5 rounded-lg bg-red-500 text-white font-semibold text-sm disabled:opacity-50">
            {busy ? "Excluindo..." : "Excluir conta"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function Stat({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3 text-center">
      <p className="text-base font-bold" style={{ color }}>{val}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}


/* ---------- Admin Panel ---------- */
function AdminPanel(props: {
  products: Product[]; setProducts: (p: Product[]) => void;
  banners: Banner[]; setBanners: (b: Banner[]) => void;
  coupons: Coupon[]; setCoupons: (c: Coupon[]) => void;
  orders: Order[]; setOrders: (o: Order[]) => void;
  settings: StoreSettings; setSettings: (s: StoreSettings) => void;
  editingProduct: Product | null; setEditingProduct: (p: Product | null) => void;
  showToast: (m: string) => void;
}) {
  const { products, setProducts, banners, setBanners, coupons, setCoupons, orders, setOrders, settings, setSettings, editingProduct, setEditingProduct, showToast } = props;
  const [section, setSection] = useState<"products" | "banners" | "coupons" | "orders" | "cashback" | "settings">("products");

  return (
    <div className="px-4 pt-4">
      <h2 className="font-bold text-xl mb-4 flex items-center gap-2"><Shield size={20} className="text-cyan-400" /> Administração</h2>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {[
          { k: "products", label: "Produtos", icon: Package },
          { k: "banners", label: "Banners", icon: ImageIcon },
          { k: "coupons", label: "Cupons", icon: Tag },
          { k: "orders", label: "Pedidos", icon: ClipboardList },
          { k: "cashback", label: "Cashback", icon: Gift },
          { k: "settings", label: "Config.", icon: Edit },
        ].map(b => (
          <button key={b.k} onClick={() => setSection(b.k as any)}
            className={`p-2 rounded-xl text-center border ${section === b.k ? "bg-blue-600 border-blue-600 text-white" : "bg-[#162340] border-cyan-500/10 text-slate-300"}`}>
            <b.icon size={18} className="mx-auto mb-1" />
            <span className="text-[10px]">{b.label}</span>
          </button>
        ))}
      </div>

      {section === "products" && (
        <ProductsAdmin products={products} setProducts={setProducts} editing={editingProduct} setEditing={setEditingProduct} showToast={showToast} />
      )}
      {section === "banners" && (
        <BannersAdmin banners={banners} setBanners={setBanners} showToast={showToast} />
      )}
      {section === "coupons" && (
        <CouponsAdmin coupons={coupons} setCoupons={setCoupons} showToast={showToast} />
      )}
      {section === "orders" && (
        <OrdersAdmin orders={orders} setOrders={setOrders} />
      )}
      {section === "cashback" && (
        <CashbackAdmin showToast={showToast} />
      )}
      {section === "settings" && (
        <SettingsAdmin settings={settings} setSettings={setSettings} showToast={showToast} />
      )}
    </div>
  );
}


function SettingsAdmin({ settings, setSettings, showToast }: {
  settings: StoreSettings; setSettings: (s: StoreSettings) => void; showToast: (m: string) => void;
}) {
  const [form, setForm] = useState<StoreSettings>(settings);
  const upd = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setForm({ ...form, [k]: v });
  const fields: { k: keyof StoreSettings; label: string; type?: string }[] = [
    { k: "storeName", label: "Nome da loja" },
    { k: "cnpj", label: "CNPJ" },
    { k: "owner", label: "Responsável" },
    { k: "whatsapp", label: "WhatsApp (com DDI, ex: 5542998722699)" },
    { k: "email", label: "E-mail" },
    { k: "address", label: "Endereço completo" },
    { k: "instagram", label: "Instagram (@usuario)" },
    { k: "deliveryFee", label: "Taxa de entrega (R$)", type: "number" },
    { k: "minOrder", label: "Pedido mínimo atacado (R$) — aplicado a lojistas", type: "number" },
  ];
  return (
    <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 space-y-3">
      <p className="font-semibold text-cyan-400">Configurações da loja</p>
      {fields.map(f => (
        <div key={f.k}>
          <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
          <input
            type={f.type || "text"}
            value={String(form[f.k] ?? "")}
            onChange={e => upd(f.k, (f.type === "number" ? Number(e.target.value) : e.target.value) as any)}
            className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
          />
        </div>
      ))}
      <button onClick={() => { setSettings(form); showToast("Configurações salvas"); }}
        className="w-full py-2.5 rounded-lg font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
        Salvar configurações
      </button>
    </div>
  );
}

function ProductsAdmin({ products, setProducts, editing, setEditing, showToast }: {
  products: Product[]; setProducts: (p: Product[]) => void;
  editing: Product | null; setEditing: (p: Product | null) => void;
  showToast: (m: string) => void;
}) {
  const blank = (): Product => ({ id: uid(), name: "", price: 0, category: "", image: "", stock: 0, description: "" });
  const [form, setForm] = useState<Product>(blank());
  const [adminSearch, setAdminSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const visibleProducts = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.subcategory || "").toLowerCase().includes(q),
    );
  }, [products, adminSearch]);


  useEffect(() => { if (editing) setForm(editing); }, [editing]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { showToast("Imagem muito grande (max 2MB)"); return; }
    const data = await fileToDataUrl(f);
    setForm({ ...form, image: data });
  };

  const save = () => {
    if (!form.name || !form.price || !form.category) { showToast("Preencha nome, preço e categoria"); return; }
    if (!form.image) { showToast("Adicione uma foto"); return; }
    const exists = products.find(p => p.id === form.id);
    setProducts(exists ? products.map(p => p.id === form.id ? form : p) : [form, ...products]);
    showToast(exists ? "Produto atualizado" : "Produto adicionado");
    setForm(blank()); setEditing(null);
  };

  const remove = (id: string) => {
    if (!confirm("Excluir produto?")) return;
    setProducts(products.filter(p => p.id !== id));
    showToast("Produto removido");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4">
        <p className="font-semibold mb-3 text-cyan-400">{editing ? "Editar produto" : "Novo produto"}</p>
        <div className="space-y-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Nome do produto" className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="0.01" value={form.price || ""} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
              placeholder="Preço" className="bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
            <input type="number" step="0.01" value={form.oldPrice || ""} onChange={e => setForm({ ...form, oldPrice: parseFloat(e.target.value) || undefined })}
              placeholder="Preço antigo (opcional)" className="bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value, subcategory: "" })}
              className="bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400">
              <option value="">Selecione a categoria</option>
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={form.subcategory || ""}
              onChange={e => setForm({ ...form, subcategory: e.target.value })}
              disabled={!form.category || !CATEGORIES_TREE[form.category]}
              className="bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 disabled:opacity-50">
              <option value="">Subcategoria</option>
              {(CATEGORIES_TREE[form.category] || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <input type="number" value={form.stock || ""} onChange={e => setForm({ ...form, stock: parseInt(e.target.value) || 0 })}
            placeholder="Estoque" className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
          <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Descrição" rows={2} className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />

          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()}
            className="w-full py-2.5 rounded-lg border-2 border-dashed border-cyan-500/40 text-sm flex items-center justify-center gap-2 hover:border-cyan-400">
            <Upload size={16} /> {form.image ? "Trocar foto" : "Enviar foto do produto"}
          </button>
          {form.image && <img src={form.image} alt="" className="w-full h-32 object-cover rounded-lg" />}

          <div className="flex gap-2">
            <button onClick={save} className="flex-1 py-2.5 rounded-lg font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
              {editing ? "Salvar alterações" : "Adicionar produto"}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setForm(blank()); }}
                className="px-4 py-2.5 rounded-lg border border-cyan-500/30">Cancelar</button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-cyan-400">
            Produtos cadastrados ({visibleProducts.length}{adminSearch ? ` de ${products.length}` : ""})
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={adminSearch} onChange={e => setAdminSearch(e.target.value)}
            placeholder="Pesquisar produto por nome, categoria..."
            className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-400" />
        </div>
        {visibleProducts.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">Nenhum produto encontrado para "{adminSearch}".</p>
        )}
        {visibleProducts.map(p => (
          <div key={p.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3 flex gap-3 items-center">
            <img src={p.image} alt="" className="w-14 h-14 rounded-lg object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{p.name}</p>
              <p className="text-xs text-slate-400">{p.category}{p.subcategory ? ` › ${p.subcategory}` : ""} · {brl(p.price)} · estoque {p.stock}</p>
            </div>
            <button onClick={() => setEditing(p)} className="p-2 text-cyan-400"><Edit size={16} /></button>
            <button onClick={() => remove(p.id)} className="p-2 text-red-400"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>

    </div>
  );
}

function BannersAdmin({ banners, setBanners, showToast }: { banners: Banner[]; setBanners: (b: Banner[]) => void; showToast: (m: string) => void }) {
  const [form, setForm] = useState<Banner>({ id: uid(), title: "", subtitle: "", image: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { showToast("Imagem muito grande"); return; }
    setForm({ ...form, image: await fileToDataUrl(f) });
  };

  return (
    <div className="space-y-3">
      <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 space-y-2">
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Título" className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
        <input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="Subtítulo" className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        <button onClick={() => fileRef.current?.click()} className="w-full py-2.5 rounded-lg border-2 border-dashed border-cyan-500/40 text-sm flex items-center justify-center gap-2">
          <Upload size={16} /> {form.image ? "Trocar imagem" : "Enviar imagem"}
        </button>
        {form.image && <img src={form.image} alt="" className="w-full h-24 object-cover rounded-lg" />}
        <button onClick={() => {
          if (!form.title || !form.image) { showToast("Preencha tudo"); return; }
          setBanners([form, ...banners]); setForm({ id: uid(), title: "", subtitle: "", image: "" });
          showToast("Banner adicionado");
        }} className="w-full py-2.5 rounded-lg font-semibold text-white" style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
          Adicionar banner
        </button>
      </div>
      {banners.map(b => (
        <div key={b.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3 flex gap-3 items-center">
          <img src={b.image} alt="" className="w-16 h-12 rounded object-cover" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{b.title}</p>
            <p className="text-xs text-slate-400 truncate">{b.subtitle}</p>
          </div>
          <button onClick={() => { setBanners(banners.filter(x => x.id !== b.id)); showToast("Removido"); }} className="p-2 text-red-400"><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}

function CouponsAdmin({ coupons, setCoupons, showToast }: { coupons: Coupon[]; setCoupons: (c: Coupon[]) => void; showToast: (m: string) => void }) {
  const [code, setCode] = useState(""); const [disc, setDisc] = useState(""); const [type, setType] = useState<"percent" | "fixed">("percent");

  return (
    <div className="space-y-3">
      <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4 space-y-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código (ex: NATAL15)" className="w-full bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={disc} onChange={e => setDisc(e.target.value)} placeholder="Desconto" className="bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
          <select value={type} onChange={e => setType(e.target.value as any)} className="bg-[#0f1d32] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400">
            <option value="percent">% Percentual</option>
            <option value="fixed">R$ Fixo</option>
          </select>
        </div>
        <button onClick={() => {
          const d = parseFloat(disc);
          if (!code || !d) { showToast("Preencha tudo"); return; }
          setCoupons([{ code, discount: d, type }, ...coupons.filter(c => c.code !== code)]);
          setCode(""); setDisc("");
          showToast("Cupom salvo");
        }} className="w-full py-2.5 rounded-lg font-semibold text-white" style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
          Adicionar cupom
        </button>
      </div>
      {coupons.map(c => (
        <div key={c.code} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3 flex items-center gap-3">
          <Tag size={18} className="text-cyan-400" />
          <div className="flex-1">
            <p className="font-bold text-sm">{c.code}</p>
            <p className="text-xs text-slate-400">{c.type === "percent" ? `${c.discount}% OFF` : `${brl(c.discount)} OFF`}</p>
          </div>
          <button onClick={() => setCoupons(coupons.filter(x => x.code !== c.code))} className="p-2 text-red-400"><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}

function OrdersAdmin({ orders, setOrders }: { orders: Order[]; setOrders: (o: Order[]) => void }) {
  if (orders.length === 0) return <p className="text-center text-sm text-slate-400 py-8">Nenhum pedido ainda.</p>;
  const cycle = (s: Order["status"]): Order["status"] => s === "Pendente" ? "Confirmado" : s === "Confirmado" ? "Entregue" : "Pendente";
  return (
    <div className="space-y-3">
      {orders.map(o => (
        <div key={o.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs text-slate-400">#{o.id.toUpperCase()}</p>
              <p className="text-xs text-slate-400">{o.date}</p>
            </div>
            <button onClick={() => setOrders(orders.map(x => x.id === o.id ? { ...x, status: cycle(x.status) } : x))}
              className={`text-xs px-3 py-1 rounded-full font-semibold ${
                o.status === "Entregue" ? "bg-emerald-500/20 text-emerald-300"
                : o.status === "Confirmado" ? "bg-blue-500/20 text-blue-300"
                : "bg-amber-500/20 text-amber-300"
              }`}>{o.status} ↻</button>
          </div>
          {o.items.map((it, idx) => (
            <p key={idx} className="text-sm">{it.qty}x {it.name}</p>
          ))}
          <p className="font-bold text-cyan-400 mt-2">{brl(o.total)}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Copy Code Modal ---------- */
function CopyCodeModal({ onClose, showToast }: { onClose: () => void; showToast: (m: string) => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.origin : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); showToast("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch { showToast("Não foi possível copiar"); }
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f1d32] rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Copy size={20} className="text-cyan-400" /> Compartilhar o site</h3>
          <button onClick={onClose} className="p-1"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-300 mb-3">Copie o link abaixo para compartilhar o site:</p>
        <div className="bg-[#0a1628] border border-cyan-500/20 rounded-lg p-3 break-all text-xs text-cyan-300 font-mono mb-3">
          {url}
        </div>
        <button onClick={copy}
          className="w-full py-2.5 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#0a4fe3,#ff6a00)" }}>
          {copied ? <><Check size={18} /> Copiado</> : <><Copy size={18} /> Copiar link</>}
        </button>
        <p className="text-xs text-slate-400 mt-4">
          Para baixar o código-fonte completo, peça ao desenvolvedor responsável o pacote do projeto.
        </p>
      </div>
    </div>
  );
}

/* ---------- Favorites tab ---------- */
function FavoritesTab({ user, products, onOpen, onToggle }: {
  user: UserData; products: Product[]; onOpen: (p: Product) => void; onToggle: (id: string) => void;
}) {
  const favs = products.filter(p => user.favorites.includes(p.id));
  return (
    <div className="px-4 pt-4">
      <h2 className="font-bold text-xl mb-3 flex items-center gap-2"><Heart size={20} className="text-red-400" /> Meus Favoritos</h2>
      {favs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">
          Nenhum favorito ainda. Toque no <Heart size={14} className="inline -mt-1" /> em qualquer produto para salvar aqui.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {favs.map(p => (
            <div key={p.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl overflow-hidden">
              <button onClick={() => onOpen(p)} className="block w-full">
                <img src={p.image} alt={p.name} className="w-full aspect-square object-cover" />
              </button>
              <div className="p-2.5 space-y-1.5">
                <p className="text-xs font-semibold line-clamp-2 min-h-[2.2em]">{p.name}</p>
                <p className="text-sm font-bold text-cyan-400">{brl(p.price)}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => onOpen(p)} className="flex-1 text-[11px] py-1.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">Ver</button>
                  <button onClick={() => onToggle(p.id)} className="px-2 py-1.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Notifications tab ---------- */
function NotificationsTab({ items, onMarkRead, onMarkAll }: {
  items: any[]; onMarkRead: (id: string) => void; onMarkAll: () => void;
}) {
  const iconFor = (kind: string) => {
    if (kind.includes("payment")) return <CreditCard size={18} className="text-emerald-400" />;
    if (kind.includes("cashback")) return <Gift size={18} className="text-cyan-300" />;
    if (kind.includes("order")) return <Package size={18} className="text-blue-300" />;
    if (kind.includes("coupon")) return <Tag size={18} className="text-amber-300" />;
    return <BellRing size={18} className="text-cyan-300" />;
  };
  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-xl flex items-center gap-2"><Bell size={20} className="text-cyan-400" /> Notificações</h2>
        {items.some(i => !i.read) && (
          <button onClick={onMarkAll} className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
            Marcar todas como lidas
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">
          Sem notificações por enquanto. Você verá aqui avisos de pagamentos, cupons e cashback.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map(n => (
            <button key={n.id} onClick={() => !n.read && onMarkRead(n.id)}
              className={`w-full text-left rounded-xl p-3 border flex gap-3 ${n.read ? "bg-[#0f1d32] border-cyan-500/10 opacity-70" : "bg-[#162340] border-cyan-500/30"}`}>
              <div className="shrink-0 mt-0.5">{iconFor(n.kind)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{n.title}</p>
                {n.body && <p className="text-xs text-slate-300 mt-0.5">{n.body}</p>}
                <p className="text-[10px] text-slate-500 mt-1">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
              </div>
              {!n.read && <span className="w-2 h-2 rounded-full bg-cyan-400 mt-2 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Cashback tab ---------- */
function CashbackTab({ data, onGoCart }: {
  data: { available: number; totalEarned: number; totalUsed: number; totalExpired: number; credits: any[] };
  onGoCart: () => void;
}) {
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
  const daysLeft = (s: string) => Math.max(0, Math.ceil((new Date(s).getTime() - Date.now()) / 86400000));
  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg,#0a4fe3,#22d3ee)" }}>
        <div className="flex items-center gap-2 text-sm opacity-90"><Gift size={18} /> Saldo de cashback</div>
        <p className="text-3xl font-bold mt-1">{brl(data.available)}</p>
        <p className="text-xs opacity-90 mt-1">disponível para usar em compras</p>
        <button onClick={onGoCart} className="mt-3 px-4 py-2 rounded-lg bg-white text-blue-700 font-semibold text-sm">
          Usar no carrinho
        </button>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 leading-relaxed">
        <p className="font-semibold flex items-center gap-1.5 mb-1"><Calendar size={14} /> Como funciona</p>
        <p>A cada compra com pagamento <b>confirmado</b>, você ganha <b>10% de cashback</b>. O valor pode ser usado em <b>novas compras</b> dentro de <b>30 dias</b>. Após esse prazo, o saldo expira e é transferido para a conta bancária da loja.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Ganho total" val={brl(data.totalEarned)} color="#10b981" />
        <Stat label="Usado" val={brl(data.totalUsed)} color="#3b82f6" />
        <Stat label="Expirado" val={brl(data.totalExpired)} color="#ef4444" />
      </div>

      <div>
        <p className="text-sm font-semibold text-cyan-300 mb-2">Histórico de créditos</p>
        {data.credits.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Nenhum cashback ainda. Faça sua primeira compra para começar.</p>
        ) : (
          <div className="space-y-2">
            {data.credits.map(c => {
              const remaining = Number(c.amount) - Number(c.used_amount);
              const colors = c.status === "active" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : c.status === "used" ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                : c.status === "expired" ? "bg-red-500/10 border-red-500/30 text-red-300"
                : "bg-slate-500/10 border-slate-500/30 text-slate-300";
              const label = c.status === "active" ? `Ativo · expira em ${daysLeft(c.expires_at)} dias`
                : c.status === "used" ? "Usado"
                : c.status === "expired" ? "Expirado"
                : "Transferido";
              return (
                <div key={c.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-bold text-white">{brl(remaining > 0 ? remaining : Number(c.amount))}</p>
                      <p className="text-[11px] text-slate-400">criado em {fmtDate(c.created_at)} · validade {fmtDate(c.expires_at)}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full border ${colors}`}>{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Admin: Cashback report ---------- */
function CashbackAdmin({ showToast }: { showToast: (m: string) => void }) {
  const fetchReport = useServerFn(adminCashbackReport);
  const markTransferred = useServerFn(adminMarkExpiredTransferred);
  const [report, setReport] = useState<{ credits: any[]; totals: { issued: number; used: number; active: number; expired: number; transferred: number } } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await fetchReport({}); setReport(r as any); }
    catch (e: any) { showToast(e?.message || "Erro ao carregar"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");

  return (
    <div className="space-y-3">
      <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-cyan-400 flex items-center gap-2"><Gift size={16} /> Relatório de Cashback</p>
          <button onClick={load} disabled={loading} className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50">
            {loading ? "..." : "Atualizar"}
          </button>
        </div>
        {report ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Emitido" val={brl(report.totals.issued)} color="#10b981" />
            <Stat label="Usado" val={brl(report.totals.used)} color="#3b82f6" />
            <Stat label="Ativo" val={brl(report.totals.active)} color="#06b6d4" />
            <Stat label="Expirado" val={brl(report.totals.expired)} color="#ef4444" />
            <div className="col-span-2">
              <Stat label="Transferido" val={brl(report.totals.transferred)} color="#a78bfa" />
            </div>
          </div>
        ) : <p className="text-xs text-slate-400">Carregando...</p>}
      </div>

      {report && report.totals.expired > 0 && (
        <button
          onClick={async () => {
            if (!confirm(`Marcar ${brl(report.totals.expired)} de cashback expirado como transferido para a conta bancária?`)) return;
            try { await markTransferred({}); showToast("Marcado como transferido"); load(); }
            catch (e: any) { showToast(e?.message || "Erro"); }
          }}
          className="w-full py-2.5 rounded-lg bg-amber-600 text-white font-semibold text-sm"
        >
          Marcar expirados como transferidos
        </button>
      )}

      <div>
        <p className="text-sm font-semibold text-cyan-300 mb-2">Últimos créditos</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {report?.credits.slice(0, 50).map(c => (
            <div key={c.id} className="bg-[#162340] border border-cyan-500/10 rounded-xl p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-white font-bold">{brl(Number(c.amount))}</span>
                <span className="text-slate-400">{c.status}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">user {String(c.user_id).slice(0, 8)} · expira {fmtDate(c.expires_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LojasParceirasStrip() {
  const fn = useServerFn(listFeaturedPartners);
  const [partners, setPartners] = useState<any[]>(() => cachedFeaturedPartners);
  useEffect(() => {
    let cancelled = false;
    fn({})
      .then((r: any) => {
        if (cancelled) return;
        const next = r.partners ?? [];
        cachedFeaturedPartners = next;
        save(LS.partners, next);
        setPartners(next);
      })
      .catch(async () => {
        if (cancelled) return;
        try {
          const { data, error } = await (supabase as any)
            .from("partners")
            .select("id, slug, nome_loja, logo_url, banner_url")
            .eq("status", "approved")
            .order("created_at", { ascending: false })
            .limit(12);
          if (!error && data) {
            cachedFeaturedPartners = data;
            save(LS.partners, data);
            setPartners(data);
            return;
          }
        } catch {}
        if (cachedFeaturedPartners.length) setPartners(cachedFeaturedPartners);
      });
    return () => { cancelled = true; };
  }, [fn]);
  if (!partners.length) return null;
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-base">Lojas Parceiras GF</h2>
        <span className="text-[11px] text-slate-400">{partners.length} {partners.length === 1 ? "loja" : "lojas"}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {partners.map((p) => (
          <Link key={p.id} to="/loja/$slug" params={{ slug: p.slug }} className="shrink-0 w-32 rounded-lg bg-[#0f1d32] border border-cyan-500/20 overflow-hidden hover:border-cyan-400">
            <div className="h-16 bg-cyan-500/10" style={p.banner_url ? { backgroundImage: `url(${p.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}} />
            <div className="p-2 flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[#162340] overflow-hidden shrink-0">
                {p.logo_url && <img src={p.logo_url} alt={p.nome_loja} className="h-full w-full object-cover" />}
              </div>
              <span className="text-[11px] font-semibold text-slate-100 line-clamp-2">{p.nome_loja}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ---------- Pedidos com rastreamento ---------- */
const REMOTE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Pago",
  preparing: "Preparando Envio",
  shipped: "Em Transporte",
  out_for_delivery: "Saiu para Entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function RemoteOrderCard({ order }: { order: any }) {
  const step = STATUS_TO_STEP[order.status] ?? 0;
  const cancelled = order.status === "cancelled";
  const items = Array.isArray(order.items) ? order.items : [];
  const dates: (string | null)[] = [null, null, null, null, null, null];
  dates[0] = order.created_at ?? null;
  if (step >= 1) dates[1] = order.paid_at ?? (step === 1 ? order.updated_at : null);
  if (step >= 2) dates[step] = order.updated_at ?? null;
  return (
    <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-xs text-slate-400">#{String(order.id).slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-slate-400">{order.created_at ? new Date(order.created_at).toLocaleString("pt-BR") : ""}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          cancelled ? "bg-red-500/20 text-red-300"
          : order.status === "delivered" ? "bg-emerald-500/20 text-emerald-300"
          : step >= 1 ? "bg-blue-500/20 text-blue-300"
          : "bg-amber-500/20 text-amber-300"
        }`}>{REMOTE_STATUS_LABEL[order.status] ?? order.status}</span>
      </div>
      <div className="space-y-1 mb-2">
        {items.map((it: any, idx: number) => (
          <p key={idx} className="text-sm">{it.qty}x {it.name} — <span className="text-slate-400">{brl(Number(it.price) * Number(it.qty))}</span></p>
        ))}
      </div>
      <p className="font-bold text-cyan-400">Total: {brl(Number(order.total))}</p>
      <OrderTrackingTimeline
        step={step}
        cancelled={cancelled}
        dates={dates}
        trackingCode={trackingCodeFromId(String(order.id))}
      />
      {!cancelled && (
        <a
          href={`/disputa/abrir/${order.id}`}
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
        >
          🛡️ Abrir Disputa
        </a>
      )}
    </div>
  );
}

function LocalOrderCard({ order }: { order: Order }) {
  const step = order.status === "Entregue" ? 5 : order.status === "Confirmado" ? 1 : 0;
  const h = order.history ?? {};
  const dates: (string | null)[] = [
    h.received ?? order.date ?? null,
    h.payment ?? null,
    h.preparing ?? null,
    h.transit ?? null,
    h.out ?? null,
    h.delivered ?? null,
  ];
  return (
    <div className="bg-[#162340] border border-cyan-500/10 rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-xs text-slate-400">#{order.id.toUpperCase()}</p>
          <p className="text-xs text-slate-400">{order.date}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          order.status === "Entregue" ? "bg-emerald-500/20 text-emerald-300"
          : order.status === "Confirmado" ? "bg-blue-500/20 text-blue-300"
          : "bg-amber-500/20 text-amber-300"
        }`}>{order.status}</span>
      </div>
      <div className="space-y-1 mb-2">
        {order.items.map((it, idx) => (
          <p key={idx} className="text-sm">{it.qty}x {it.name} — <span className="text-slate-400">{brl(it.price * it.qty)}</span></p>
        ))}
      </div>
      <p className="font-bold text-cyan-400">Total: {brl(order.total)}</p>
      <OrderTrackingTimeline
        step={step}
        dates={dates}
        trackingCode={order.tracking ?? trackingCodeFromId(order.id)}
      />
    </div>
  );
}