import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getStoreBySlug } from "@/lib/partner-panel.functions";
import { createCheckout } from "@/lib/checkout.functions";
import {
  Award, Star, MessageCircle, Instagram, Facebook, Globe, ArrowLeft, Search, X,
  Menu, ShoppingCart, ChevronRight, ChevronDown, Truck, ShieldCheck, Headphones,
  BadgeCheck, Tag, Home, Grid3x3, Flame, Package, User, Minus, Plus, Heart, Share2,
  Bell, Settings, SlidersHorizontal, Store as StoreIcon, Wallet, Heart as HeartIcon,
  HelpCircle, ClipboardList, DollarSign, CreditCard,
} from "lucide-react";
import { ChatButton } from "@/components/ChatWidget";
import { StoreBadges } from "@/components/StoreBadges";
import { FollowButton } from "@/components/FollowButton";
import logoGF from "@/assets/grupo-gf-logo.png";

export const Route = createFileRoute("/loja/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Loja ${params.slug} — Grupo GF` },
      { name: "description", content: "Conheça a loja parceira do Grupo GF Rede Varejista." },
    ],
  }),
  component: StorePage,
});

const BRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Section = "home" | "categories" | "offers" | "orders" | "account";

const storePageCache = new Map<string, any>();

function loadStoreCart(slug: string): { id: string; qty: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`gf_store_cart_${slug}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoreCart(slug: string, cart: { id: string; qty: number }[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`gf_store_cart_${slug}`, JSON.stringify(cart)); } catch {}
}

function StorePage() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getStoreBySlug);
  const { data, isLoading } = useQuery({
    queryKey: ["store", slug],
    queryFn: () => fn({ data: { slug } }),
    placeholderData: () => storePageCache.get(slug),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("Todos");
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [activeProduct, setActiveProduct] = useState<any | null>(null);
  const [qty, setQty] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  // Local "store cart" — fica isolado do carrinho principal pra não mexer no app
  const [storeCart, setStoreCart] = useState<{ id: string; qty: number }[]>(() => loadStoreCart(slug));
  const [directBuy, setDirectBuy] = useState<{ product: any; qty: number } | null>(null);
  const checkoutFn = useServerFn(createCheckout);

  useEffect(() => {
    if (data?.store) storePageCache.set(slug, data);
  }, [data, slug]);

  useEffect(() => {
    setStoreCart(loadStoreCart(slug));
  }, [slug]);

  useEffect(() => {
    saveStoreCart(slug, storeCart);
  }, [slug, storeCart]);

  const products = (data?.products ?? []) as any[];

  // Build category → subcategory tree
  const tree = useMemo(() => {
    const map = new Map<string, Set<string>>();
    products.forEach((p) => {
      const c = (p.category || "Outros").trim();
      const sc = (p.subcategory || "").trim();
      if (!map.has(c)) map.set(c, new Set<string>());
      if (sc) map.get(c)!.add(sc);
    });
    return Array.from(map.entries())
      .map(([cat, set]) => ({ cat, subs: Array.from(set).sort() }))
      .sort((a, b) => a.cat.localeCompare(b.cat));
  }, [products]);

  const categories = useMemo(() => ["Todos", ...tree.map((t) => t.cat)], [tree]);

  // Featured/Offers heuristic: 8 cheaper products marked as "Oferta"
  const offers = useMemo(() => {
    return [...products].sort((a, b) => Number(a.price) - Number(b.price)).slice(0, 12);
  }, [products]);
  const offerIds = useMemo(() => new Set(offers.map((p) => p.id)), [offers]);

  const featured = useMemo(() => products.slice(0, 8), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = products;
    if (section === "offers") base = offers;
    return base.filter((p) => {
      const matchesCat = category === "Todos" || p.category === category;
      const matchesSub = !subcategory || p.subcategory === subcategory;
      const matchesQ =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q);
      return matchesCat && matchesSub && matchesQ;
    });
  }, [products, search, category, subcategory, offers, section]);

  useEffect(() => {
    if (activeProduct) {
      setQty(1);
      const variants = Array.isArray(activeProduct.product_variants) ? activeProduct.product_variants : [];
      const firstAvailable = variants.find((v: any) => Number(v.stock) > 0) || variants[0];
      setSelectedVariantId(firstAvailable ? firstAvailable.id : null);
    } else {
      setSelectedVariantId(null);
    }
  }, [activeProduct]);

  const selectedVariant = useMemo(() => {
    if (!activeProduct || !selectedVariantId) return null;
    const variants = Array.isArray(activeProduct.product_variants) ? activeProduct.product_variants : [];
    return variants.find((v: any) => v.id === selectedVariantId) || null;
  }, [activeProduct, selectedVariantId]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1628] text-slate-300">
        Carregando loja…
      </div>
    );
  }
  if (!data?.store) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0a1628] text-slate-200">
        <p>Loja não encontrada.</p>
        <Link to="/" className="rounded-md bg-cyan-500 px-4 py-2 text-sm text-white">
          Voltar ao início
        </Link>
      </div>
    );
  }

  const s: any = data.store;
  const social = (s.endereco?.social ?? {}) as any;
  const cartCount = storeCart.reduce((acc, i) => acc + i.qty, 0);

  const waNumber = String(social.whatsapp || "").replace(/\D/g, "");
  const buyOnWhatsApp = (p: any, q: number) => {
    if (!waNumber) {
      alert("Esta loja ainda não cadastrou WhatsApp para compra direta. Use o chat com o vendedor.");
      return;
    }
    const txt =
      `Olá! Quero comprar pela loja *${s.nome_loja}*:%0A` +
      `• ${q}x ${p.name}%0A` +
      `• Valor unit.: ${BRL(p.price)}%0A` +
      `• Total: ${BRL(p.price * q)}`;
    window.open(`https://wa.me/${waNumber}?text=${txt}`, "_blank");
  };

  const addToStoreCart = (p: any, q: number) => {
    setStoreCart((cur) => {
      const i = cur.findIndex((x) => x.id === p.id);
      if (i >= 0) {
        const next = [...cur];
        next[i] = { ...next[i], qty: next[i].qty + q };
        return next;
      }
      return [...cur, { id: p.id, qty: q }];
    });
  };

  const chooseCategory = (cat: string, sub?: string | null) => {
    setCategory(cat);
    setSubcategory(sub ?? null);
    setSection("home");
    setSidebarOpen(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0a1628] text-slate-100">
      {/* ===== Top Bar ===== */}
      <header className="sticky top-0 z-30 backdrop-blur-md border-b border-cyan-500/10" style={{ background: "rgba(10,22,40,0.95)" }}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-2 hover:bg-white/10"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5 p-0.5">
              {s.logo_url ? (
                <img src={s.logo_url} alt={s.nome_loja} className="h-full w-full object-contain" />
              ) : (
                <img src={logoGF} alt="GF" className="h-full w-full object-contain" />
              )}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-extrabold tracking-wide uppercase text-white">
                {s.nome_loja}
              </p>
              <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <BadgeCheck className="h-3.5 w-3.5" /> Marketplace Oficial
              </p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <button className="rounded-full border border-cyan-500/30 p-2 hover:bg-white/10">
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSection("orders")}
              className="relative rounded-md p-2 hover:bg-white/10"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
            <button className="relative rounded-md p-2 hover:bg-white/10">
              <Bell className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search + Filtros */}
        <div className="px-3 pb-2.5">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produtos, marcas e muito mais..."
                className="w-full rounded-xl bg-[#0f1d32] py-2.5 pl-9 pr-3 text-sm ring-1 ring-cyan-500/15 placeholder:text-slate-500 focus:outline-none focus:ring-cyan-400"
              />
            </div>
            <button className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-white/5">
              <SlidersHorizontal className="h-4 w-4" /> Filtros
            </button>
          </div>
        </div>
      </header>

      {/* ===== Scroll body ===== */}
      <main className="flex-1 overflow-y-auto pb-24">
        {/* Trust ribbon */}
        <div className="grid grid-cols-2 gap-2 border-b border-cyan-500/10 px-3 py-3 text-[11px] sm:grid-cols-4">
          {[
            { icon: ShieldCheck, t: "Loja Oficial", s: "Verificada", c: "text-emerald-400" },
            { icon: Truck, t: "Envio Rápido", s: "Para todo o Brasil", c: "text-cyan-400" },
            { icon: ShieldCheck, t: "Compra Segura", s: "Ambiente protegido", c: "text-violet-400" },
            { icon: Headphones, t: "Suporte", s: "Atendimento rápido", c: "text-amber-400" },
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

        {/* Store profile card */}
        <section className="px-3 pt-3">
          <div className="rounded-xl bg-[#0f1d32] p-3 ring-1 ring-cyan-500/15">
            <div className="flex gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#0a1628] ring-1 ring-cyan-500/20">
                {s.logo_url ? (
                  <img src={s.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-2xl font-bold text-cyan-300">
                    {s.nome_loja?.[0]}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="flex items-center gap-1 text-lg font-bold">
                  {s.nome_loja}
                  {s.verified && <BadgeCheck className="h-4 w-4 text-cyan-400" />}
                </h1>
                {s.descricao && (
                  <p className="line-clamp-1 text-xs text-slate-400">{s.descricao}</p>
                )}
                <div className="mt-1 flex items-center gap-1 text-xs">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${
                        i <= Math.round(data?.stats?.avgRating ?? 0)
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-600"
                      }`}
                    />
                  ))}
                  <span className="font-semibold">
                    {(data?.stats?.avgRating ?? 0).toFixed(1)}
                  </span>
                  <span className="text-slate-400">({data?.stats?.sales ?? 0} avaliações)</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  📦 {data?.stats?.sales ?? 0} vendas · 📅 Membro desde{" "}
                  {new Date(s.created_at).getFullYear()}
                </p>
                <div className="mt-2">
                  <StoreBadges
                    status={s.status}
                    verified={s.verified}
                    reliable_shipping={s.reliable_shipping}
                    sales={data?.stats?.sales ?? 0}
                    cancelRate={data?.stats?.cancelRate ?? 0}
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <FollowButton sellerId={s.id} />
              <ChatButton
                partnerId={s.id}
                sellerName={s.nome_loja}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/20"
              />
            </div>
          </div>
        </section>

        {s.cover_url && (
          <section className="px-3 pt-3">
            <img src={s.cover_url} alt="Capa da loja" className="h-36 w-full rounded-xl object-cover ring-1 ring-cyan-500/20" />
          </section>
        )}

        {/* Hero banner */}
        <section className="px-3 pt-3">
          <div
            className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0b223d] via-[#0a1628] to-[#11304f] p-5 ring-1 ring-cyan-500/20"
            style={
              s.banner_url
                ? {
                    backgroundImage: `linear-gradient(rgba(10,22,40,0.7), rgba(10,22,40,0.85)), url(${s.banner_url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : {}
            }
          >
            <h2 className="text-2xl font-extrabold leading-tight">
              <span className="text-white">PRODUTOS DE</span>
              <br />
              <span className="text-orange-400">ALTA PERFORMANCE</span>
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Qualidade • Confiança • Resultado
            </p>
            <button
              onClick={() => setSection("categories")}
              className="mt-3 rounded-md border border-cyan-400/60 bg-transparent px-4 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/10"
            >
              Ver produtos
            </button>
          </div>
        </section>

        {/* Banners do vendedor */}
        {Array.isArray(s.store_banners) && s.store_banners.length > 0 && (
          <section className="px-3 pt-3">
            <div className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3">
              {s.store_banners.map((url: string, i: number) => (
                <img
                  key={i}
                  src={url}
                  alt={`Banner ${i + 1}`}
                  className="h-32 w-[85%] flex-none snap-center rounded-lg object-cover ring-1 ring-cyan-500/20"
                />
              ))}
            </div>
          </section>
        )}


        {/* Categories chips */}
        {tree.length > 0 && (
          <section className="px-3 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-bold">Categorias</h3>
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-xs font-semibold text-cyan-400"
              >
                Ver todas
              </button>
            </div>
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
              {tree.map(({ cat }) => (
                <button
                  key={cat}
                  onClick={() => chooseCategory(cat)}
                  className={`flex min-w-[88px] flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition ${
                    category === cat
                      ? "border-cyan-400 bg-cyan-500/10 text-cyan-300"
                      : "border-cyan-500/15 bg-[#0f1d32] text-slate-200 hover:border-cyan-500/40"
                  }`}
                >
                  <Package className="h-5 w-5" />
                  <span className="whitespace-nowrap font-medium">{cat}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Active filter chip */}
        {(category !== "Todos" || subcategory) && (
          <div className="px-3 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Filtrando por:</span>
              <button
                onClick={() => {
                  setCategory("Todos");
                  setSubcategory(null);
                }}
                className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-3 py-1 text-xs text-cyan-300"
              >
                {category}
                {subcategory ? ` › ${subcategory}` : ""}
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Featured / list */}
        <section className="px-3 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-bold">
              {section === "offers"
                ? "Ofertas"
                : category !== "Todos"
                ? category
                : "Produtos em destaque"}
              {filtered.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  ({filtered.length})
                </span>
              )}
            </h3>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-md border border-dashed border-cyan-500/20 p-6 text-center text-sm text-slate-400">
              {products.length === 0
                ? "Esta loja ainda não anunciou produtos."
                : "Nenhum produto encontrado."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveProduct(p)}
                  className="group overflow-hidden rounded-lg bg-[#0f1d32] text-left ring-1 ring-cyan-500/15 transition hover:ring-cyan-400"
                >
                  <div className="relative aspect-square bg-[#0a1628]">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-slate-600">
                        <Package className="h-8 w-8" />
                      </div>
                    )}
                    {offerIds.has(p.id) && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        Oferta
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 text-xs font-medium text-slate-100">
                      {p.name}
                    </p>
                    {p.subcategory && (
                      <p className="mt-0.5 text-[10px] text-slate-400">{p.subcategory}</p>
                    )}
                    <p className="mt-1 text-sm font-bold text-cyan-300">{BRL(p.price)}</p>
                    <p className="text-[10px] text-slate-500">
                      em 6x de {BRL(Number(p.price) / 6)}
                    </p>
                    {Array.isArray(p.product_variants) && p.product_variants.length > 0 && (() => {
                      const vs = p.product_variants as any[];
                      const thumbs = vs.filter((v) => v.image_url).slice(0, 4);
                      const colors = Array.from(new Set(vs.map((v) => v.attributes?.color).filter(Boolean))).slice(0, 5) as string[];
                      const sizes = Array.from(new Set(vs.map((v) => v.attributes?.size).filter(Boolean))).slice(0, 5) as string[];
                      return (
                        <div className="mt-1.5 space-y-1">
                          {thumbs.length > 0 && (
                            <div className="flex items-center gap-1">
                              {thumbs.map((v) => (
                                <span key={v.id} className="h-6 w-6 overflow-hidden rounded border border-cyan-500/30 bg-[#0a1628]">
                                  <img src={v.image_url} alt="" className="h-full w-full object-cover" />
                                </span>
                              ))}
                              {vs.length > thumbs.length && (
                                <span className="text-[9px] text-slate-400">+{vs.length - thumbs.length}</span>
                              )}
                            </div>
                          )}
                          {colors.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {colors.map((c) => (
                                <span key={c} className="rounded border border-cyan-500/30 px-1 py-px text-[9px] text-slate-300">
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                          {sizes.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {sizes.map((s) => (
                                <span key={s} className="rounded bg-cyan-500/10 px-1 py-px text-[9px] font-semibold text-cyan-200">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-[9px] text-slate-500">{vs.length} variação(ões) disponíveis</p>
                        </div>
                      );
                    })()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Promo ribbon */}
        <section className="px-3 pt-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#0f1d32] p-3 ring-1 ring-cyan-500/15 sm:grid-cols-4">
            {[
              { icon: Tag, t: "Parcelamento", s: "em até 6x sem juros", c: "text-cyan-400" },
              { icon: BadgeCheck, t: "5% de Desconto", s: "no PIX", c: "text-emerald-400" },
              { icon: Truck, t: "Frete Grátis", s: "acima de R$199", c: "text-orange-400" },
              { icon: ShieldCheck, t: "Troca Garantida", s: "em até 7 dias", c: "text-violet-400" },
            ].map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <it.icon className={`h-4 w-4 shrink-0 ${it.c}`} />
                <div className="leading-tight">
                  <p className="font-semibold">{it.t}</p>
                  <p className="text-slate-400">{it.s}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Social links */}
        {(social.whatsapp || social.instagram || social.facebook || social.site) && (
          <section className="px-3 pt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-300">Fale com a loja</h3>
            <div className="flex flex-wrap gap-2">
              {social.whatsapp && (
                <a
                  href={`https://wa.me/${waNumber}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              )}
              {social.instagram && (
                <a
                  href={`https://instagram.com/${String(social.instagram).replace(/^@/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-pink-500/40 bg-pink-500/10 px-3 py-1.5 text-xs text-pink-300"
                >
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              )}
              {social.facebook && (
                <a
                  href={social.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300"
                >
                  <Facebook className="h-4 w-4" /> Facebook
                </a>
              )}
              {social.site && (
                <a
                  href={social.site}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300"
                >
                  <Globe className="h-4 w-4" /> Site
                </a>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ===== Bottom nav ===== */}
      <nav className="border-t border-cyan-500/15 bg-[#0a1628]">
        <div className="grid grid-cols-5">
          {[
            { id: "home", label: "Início", icon: Home },
            { id: "categories", label: "Categorias", icon: Grid3x3 },
            { id: "offers", label: "Ofertas", icon: Flame },
            { id: "orders", label: "Carrinho", icon: ShoppingCart, badge: cartCount },
            { id: "account", label: "Voltar", icon: ArrowLeft, isBack: true },
          ].map((t: any) => {
            const Icon = t.icon;
            const active = section === t.id;
            const className = `relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              active ? "text-cyan-300" : "text-slate-400"
            }`;
            const content = (
              <>
                <Icon className="h-5 w-5" />
                {t.label}
                {t.badge > 0 && (
                  <span className="absolute right-3 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                    {t.badge}
                  </span>
                )}
              </>
            );
            if (t.isBack) {
              return (
                <Link key={t.id} to="/" className={className}>
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={t.id}
                onClick={() => {
                  setSection(t.id as Section);
                  if (t.id === "categories") setSidebarOpen(true);
                  if (t.id === "offers") {
                    setCategory("Todos");
                    setSubcategory(null);
                  }
                  if (t.id === "home") {
                    setCategory("Todos");
                    setSubcategory(null);
                  }
                }}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ===== Sidebar drawer ===== */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative h-full w-[86%] max-w-[360px] overflow-y-auto bg-[#0a1628] ring-1 ring-cyan-500/20">
            {/* ===== Header com logo + Marketplace Oficial ===== */}
            <div className="flex items-start gap-3 p-4">
              <img src={logoGF} alt="Grupo GF" className="h-14 w-14 shrink-0 rounded-lg bg-white/5 p-1 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold uppercase tracking-wide text-white">GRUPO GF</p>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-400">Rede Varejista</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                  <BadgeCheck className="h-3 w-3" /> Marketplace Oficial
                </span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/5 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ===== Card visitante ===== */}
            <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-[#0f1d32] p-3 ring-1 ring-cyan-500/15">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#0a1628] ring-1 ring-cyan-500/20">
                <User className="h-5 w-5 text-slate-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">Olá, visitante!</p>
                <p className="text-[11px] text-slate-400 leading-tight">Faça login e aproveite as melhores ofertas</p>
              </div>
              <Link
                to="/auth"
                className="rounded-lg px-3 py-2 text-xs font-bold text-white shadow-md"
                style={{ background: "linear-gradient(135deg,#0a4fe3,#8b5cf6)" }}
              >
                Entrar <ChevronRight className="inline h-3 w-3" />
              </Link>
            </div>

            {/* ===== Carteira GF ===== */}
            <div className="mx-4 mb-4 rounded-xl bg-[#0f1d32] p-3 ring-1 ring-cyan-500/15">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <Wallet className="h-4 w-4 text-cyan-400" /> Carteira GF
                </span>
                <Link to="/carteira" className="flex items-center gap-0.5 text-xs font-semibold text-cyan-400">
                  Ver detalhes <ChevronRight className="h-3 w-3" />
                </Link>
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
                  <p className="font-bold text-violet-400">R$ 0,00</p>
                </div>
              </div>
            </div>

            {/* ===== PRINCIPAL ===== */}
            <p className="px-5 pb-1 text-[11px] font-bold tracking-wider text-slate-500">PRINCIPAL</p>
            <div className="px-2">
              {[
                { label: "Início", icon: Home, onClick: () => { setCategory("Todos"); setSubcategory(null); setSection("home"); setSidebarOpen(false); }, active: section === "home" && category === "Todos" },
                { label: "Categorias", icon: Grid3x3, onClick: () => { setSection("categories"); }, active: section === "categories" },
                { label: "Carrinho", icon: ShoppingCart, badge: cartCount, onClick: () => { setSection("orders"); setSidebarOpen(false); } },
                { label: "Favoritos", icon: HeartIcon, onClick: () => setSidebarOpen(false) },
                { label: "Notificações", icon: Bell, onClick: () => setSidebarOpen(false) },
                { label: "Meu Cashback", icon: DollarSign, onClick: () => setSidebarOpen(false) },
                { label: "Minhas Compras", icon: Package, onClick: () => setSidebarOpen(false) },
                { label: "Perfil", icon: User, onClick: () => setSidebarOpen(false) },
                { label: "FAQ", icon: HelpCircle, onClick: () => setSidebarOpen(false) },
              ].map((it: any) => (
                <button
                  key={it.label}
                  onClick={it.onClick}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm ${
                    it.active
                      ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30"
                      : "text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <it.icon className={`h-5 w-5 ${it.active ? "text-cyan-400" : "text-slate-400"}`} />
                  <span className="flex-1 text-left font-medium">{it.label}</span>
                  {it.badge > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {it.badge}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </button>
              ))}
            </div>

            {/* ===== Venda com a gente ===== */}
            <p className="mt-3 px-5 pb-1 text-[11px] font-bold tracking-wider text-slate-500">VENDA COM A GENTE</p>
            <div className="px-4 pb-2">
              <Link
                to="/seja-um-parceiro"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 rounded-xl bg-cyan-500/10 p-3 ring-1 ring-cyan-500/40 hover:bg-cyan-500/15"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-500/20">
                  <StoreIcon className="h-5 w-5 text-cyan-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-cyan-300">TORNE-SE PARCEIRO GF</p>
                  <p className="text-[11px] text-slate-400">Venda online e aumente seus ganhos</p>
                </div>
                <ChevronRight className="h-4 w-4 text-cyan-400" />
              </Link>
            </div>

            {/* ===== TODAS AS CATEGORIAS desta loja ===== */}
            <p className="mt-3 px-5 pb-1 text-[11px] font-bold tracking-wider text-slate-500">TODAS AS CATEGORIAS</p>
            <div className="px-2 pb-6">
              {tree.length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-500">Esta loja ainda não cadastrou categorias.</p>
              )}
              {tree.map(({ cat, subs }) => {
                const open = openCat === cat;
                const count = products.filter((p) => p.category === cat).length;
                return (
                  <div key={cat}>
                    <button
                      onClick={() => {
                        if (subs.length === 0) chooseCategory(cat);
                        else setOpenCat(open ? null : cat);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-200 hover:bg-white/5"
                    >
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-[#0f1d32] ring-1 ring-cyan-500/15">
                        <Package className="h-4 w-4 text-slate-300" />
                      </div>
                      <span className="flex-1 text-left font-medium">{cat}</span>
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
                          onClick={() => chooseCategory(cat)}
                          className="block w-full rounded px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5"
                        >
                          Tudo em {cat}
                        </button>
                        {subs.map((sc) => (
                          <button
                            key={sc}
                            onClick={() => chooseCategory(cat, sc)}
                            className={`block w-full rounded px-3 py-2 text-left text-xs ${
                              subcategory === sc
                                ? "bg-cyan-500/15 text-cyan-300"
                                : "text-slate-300 hover:bg-white/5"
                            }`}
                          >
                            {sc}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ===== Trust ribbon footer ===== */}
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

      {/* ===== Product detail bottom sheet (Shopee style) ===== */}
      {activeProduct && (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#0a1628]">
          {/* header */}
          <div className="flex items-center gap-2 border-b border-cyan-500/15 px-3 py-2">
            <button
              onClick={() => setActiveProduct(null)}
              className="rounded-md p-2 hover:bg-white/5"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <p className="line-clamp-1 text-sm font-semibold">{activeProduct.name}</p>
            <div className="ml-auto flex items-center gap-1">
              <button className="rounded-md p-2 hover:bg-white/5">
                <Heart className="h-5 w-5" />
              </button>
              <button className="rounded-md p-2 hover:bg-white/5">
                <Share2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* body */}
          <div className="flex-1 overflow-y-auto pb-28">
            <div className="aspect-square w-full bg-[#0f1d32]">
              {(selectedVariant?.image_url || activeProduct.image_url) ? (
                <img
                  src={selectedVariant?.image_url || activeProduct.image_url}
                  alt={activeProduct.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-slate-600">
                  <Package className="h-12 w-12" />
                </div>
              )}
            </div>

            <div className="p-3">
              <div className="flex items-end gap-2">
                <p className="text-2xl font-extrabold text-orange-400">
                  {BRL(Number(selectedVariant?.discount_price ?? selectedVariant?.price ?? activeProduct.price) || 0)}
                </p>
                {offerIds.has(activeProduct.id) && (
                  <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Oferta
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                ou em até 6x de {BRL((Number(selectedVariant?.discount_price ?? selectedVariant?.price ?? activeProduct.price) || 0) / 6)} sem juros
              </p>
              <h2 className="mt-2 text-base font-semibold">{activeProduct.name}</h2>

              {/* ===== Variações estilo Amazon / Mercado Livre ===== */}
              {Array.isArray(activeProduct.product_variants) && activeProduct.product_variants.length > 0 && (() => {
                const variants = activeProduct.product_variants as any[];
                const groups: Record<string, { value: string; variant: any }[]> = {};
                variants.forEach((v) => {
                  const attrs = (v.attributes || {}) as Record<string, any>;
                  Object.entries(attrs).forEach(([k, val]) => {
                    if (val == null || val === "") return;
                    const key = String(k);
                    const sval = String(val);
                    groups[key] ||= [];
                    if (!groups[key].some((g) => g.value === sval)) groups[key].push({ value: sval, variant: v });
                  });
                });
                const selAttrs = (selectedVariant?.attributes || {}) as Record<string, any>;
                const findVariantByAttr = (k: string, val: string) =>
                  variants.find((v) => String((v.attributes || {})[k] ?? "") === val) ||
                  variants.find((v) => v.name === val) ||
                  null;
                const groupKeys = Object.keys(groups);
                const hasGroups = groupKeys.length > 0;

                return (
                  <div className="mt-4 rounded-lg bg-[#0f1d32] p-3 ring-1 ring-cyan-500/15">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Escolha uma variação
                    </p>

                    {/* Thumbnails (estilo Amazon) */}
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                      {variants.map((v) => {
                        const active = v.id === selectedVariantId;
                        const out = !(Number(v.stock) > 0);
                        return (
                          <button
                            key={v.id}
                            onClick={() => setSelectedVariantId(v.id)}
                            title={v.name}
                            className={`relative shrink-0 overflow-hidden rounded-md ring-2 transition ${
                              active ? "ring-orange-400" : "ring-cyan-500/15 hover:ring-cyan-400/60"
                            } ${out ? "opacity-50" : ""}`}
                          >
                            {v.image_url ? (
                              <img src={v.image_url} alt={v.name} className="h-14 w-14 object-cover" />
                            ) : (
                              <div className="grid h-14 w-14 place-items-center bg-[#0a1628] text-slate-500">
                                <Package className="h-5 w-5" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Atributos agrupados (cor, tamanho, etc.) estilo Mercado Livre */}
                    {hasGroups ? (
                      groupKeys.map((k) => (
                        <div key={k} className="mb-2 last:mb-0">
                          <p className="mb-1 text-[11px] text-slate-300">
                            <span className="capitalize text-slate-400">{k}:</span>{" "}
                            <span className="font-semibold text-slate-100">
                              {String(selAttrs[k] ?? "—")}
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {groups[k].map((opt) => {
                              const active = String(selAttrs[k] ?? "") === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => {
                                    const target = findVariantByAttr(k, opt.value);
                                    if (target) setSelectedVariantId(target.id);
                                  }}
                                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                                    active
                                      ? "border-orange-400 bg-orange-400/10 text-orange-300"
                                      : "border-cyan-500/20 bg-[#0a1628] text-slate-200 hover:border-cyan-400/60"
                                  }`}
                                >
                                  {opt.value}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {variants.map((v) => {
                          const active = v.id === selectedVariantId;
                          return (
                            <button
                              key={v.id}
                              onClick={() => setSelectedVariantId(v.id)}
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                                active
                                  ? "border-orange-400 bg-orange-400/10 text-orange-300"
                                  : "border-cyan-500/20 bg-[#0a1628] text-slate-200 hover:border-cyan-400/60"
                              }`}
                            >
                              {v.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedVariant && (
                      <div className="mt-3 flex items-center justify-between border-t border-cyan-500/10 pt-2 text-[11px]">
                        <span className="text-slate-400">
                          {selectedVariant.sku ? `SKU: ${selectedVariant.sku}` : selectedVariant.name}
                        </span>
                        <span className={Number(selectedVariant.stock) > 0 ? "text-emerald-400" : "text-rose-400"}>
                          {Number(selectedVariant.stock) > 0
                            ? `${selectedVariant.stock} em estoque`
                            : "Indisponível"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}


              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                {activeProduct.category && (
                  <span className="rounded bg-[#0f1d32] px-2 py-0.5 ring-1 ring-cyan-500/15">
                    {activeProduct.category}
                  </span>
                )}
                {activeProduct.subcategory && (
                  <span className="rounded bg-[#0f1d32] px-2 py-0.5 ring-1 ring-cyan-500/15">
                    {activeProduct.subcategory}
                  </span>
                )}
              </div>

              {activeProduct.description && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Descrição
                  </p>
                  <p className="whitespace-pre-line text-sm text-slate-200">
                    {activeProduct.description}
                  </p>
                </div>
              )}

              <div className="mt-4 rounded-lg bg-[#0f1d32] p-3 ring-1 ring-cyan-500/15">
                <p className="text-xs text-slate-400">Vendido e entregue por</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-8 w-8 overflow-hidden rounded-md bg-[#0a1628]">
                    {s.logo_url && (
                      <img src={s.logo_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.nome_loja}</p>
                    <p className="text-[10px] text-emerald-400">LOJA OFICIAL</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm font-semibold">Quantidade</span>
                <div className="flex items-center gap-2 rounded-md bg-[#0f1d32] ring-1 ring-cyan-500/15">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="grid h-9 w-9 place-items-center text-cyan-300"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold">{qty}</span>
                  <button
                    onClick={() => setQty((q) => q + 1)}
                    className="grid h-9 w-9 place-items-center text-cyan-300"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {activeProduct.stock_quantity > 0 && (
                  <span className="text-[11px] text-slate-400">
                    {activeProduct.stock_quantity} em estoque
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action bar (Shopee style) */}
          <div className="absolute inset-x-0 bottom-0 grid grid-cols-6 gap-0 border-t border-cyan-500/15 bg-[#0a1628]">
            <ChatButton
              partnerId={s.id}
              sellerName={s.nome_loja}
              className="col-span-1 flex flex-col items-center justify-center py-2 text-[10px] text-slate-300 hover:bg-white/5"
            />
            <button
              onClick={() => {
                addToStoreCart(activeProduct, qty);
                setActiveProduct(null);
              }}
              className="col-span-2 bg-cyan-500/15 py-3 text-sm font-bold text-cyan-300 hover:bg-cyan-500/25"
            >
              Adicionar
            </button>
            {s.direct_checkout_enabled !== false ? (
              <>
                <button
                  onClick={() => { setDirectBuy({ product: activeProduct, qty }); setActiveProduct(null); }}
                  className="col-span-2 bg-emerald-500 py-3 text-xs font-bold text-white hover:bg-emerald-600 inline-flex items-center justify-center gap-1"
                >
                  <CreditCard className="h-4 w-4" /> Comprar
                </button>
                <button
                  onClick={() => buyOnWhatsApp(activeProduct, qty)}
                  className="col-span-1 bg-orange-500 py-3 text-[10px] font-bold text-white hover:bg-orange-600"
                >
                  WhatsApp
                </button>
              </>
            ) : (
              <button
                onClick={() => buyOnWhatsApp(activeProduct, qty)}
                className="col-span-3 bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600"
              >
                Comprar agora
              </button>
            )}
          </div>
        </div>
      )}

      {directBuy && (
        <DirectCheckoutDialog
          store={s}
          product={directBuy.product}
          qty={directBuy.qty}
          checkoutFn={checkoutFn}
          onClose={() => setDirectBuy(null)}
        />
      )}

      {/* ===== Store cart sheet ===== */}
      {section === "orders" && (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#0a1628]">
          <div className="flex items-center gap-2 border-b border-cyan-500/15 px-3 py-2">
            <button
              onClick={() => setSection("home")}
              className="rounded-md p-2 hover:bg-white/5"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <p className="text-sm font-semibold">Carrinho — {s.nome_loja}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {storeCart.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-sm text-slate-400">
                <div>
                  <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-slate-600" />
                  Seu carrinho desta loja está vazio.
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {storeCart.map((ci) => {
                  const p = products.find((x) => x.id === ci.id);
                  if (!p) return null;
                  return (
                    <li
                      key={ci.id}
                      className="flex gap-2 rounded-lg bg-[#0f1d32] p-2 ring-1 ring-cyan-500/15"
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[#0a1628]">
                        {p.image_url && (
                          <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm">{p.name}</p>
                        <p className="text-sm font-bold text-cyan-300">
                          {BRL(p.price * ci.qty)}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            onClick={() =>
                              setStoreCart((cur) =>
                                cur
                                  .map((x) =>
                                    x.id === ci.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x,
                                  )
                                  .filter((x) => x.qty > 0),
                              )
                            }
                            className="grid h-7 w-7 place-items-center rounded bg-[#0a1628] text-cyan-300"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm">{ci.qty}</span>
                          <button
                            onClick={() =>
                              setStoreCart((cur) =>
                                cur.map((x) =>
                                  x.id === ci.id ? { ...x, qty: x.qty + 1 } : x,
                                ),
                              )
                            }
                            className="grid h-7 w-7 place-items-center rounded bg-[#0a1628] text-cyan-300"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() =>
                              setStoreCart((cur) => cur.filter((x) => x.id !== ci.id))
                            }
                            className="ml-auto text-xs text-rose-400"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {storeCart.length > 0 && (
            <div className="border-t border-cyan-500/15 bg-[#0a1628] p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-400">Total</span>
                <span className="text-lg font-extrabold text-cyan-300">
                  {BRL(
                    storeCart.reduce((acc, ci) => {
                      const p = products.find((x) => x.id === ci.id);
                      return acc + (p ? Number(p.price) * ci.qty : 0);
                    }, 0),
                  )}
                </span>
              </div>
              <button
                onClick={() => {
                  if (!waNumber) {
                    alert("WhatsApp da loja indisponível. Fale pelo chat.");
                    return;
                  }
                  const lines = storeCart
                    .map((ci) => {
                      const p = products.find((x) => x.id === ci.id);
                      if (!p) return "";
                      return `• ${ci.qty}x ${p.name} — ${BRL(Number(p.price) * ci.qty)}`;
                    })
                    .filter(Boolean)
                    .join("%0A");
                  const total = storeCart.reduce((acc, ci) => {
                    const p = products.find((x) => x.id === ci.id);
                    return acc + (p ? Number(p.price) * ci.qty : 0);
                  }, 0);
                  const txt = `Olá! Quero fechar pedido com a *${s.nome_loja}*:%0A${lines}%0A%0ATotal: ${BRL(total)}`;
                  window.open(`https://wa.me/${waNumber}?text=${txt}`, "_blank");
                }}
                className="block w-full rounded-md bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600"
              >
                Finalizar via WhatsApp
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DirectCheckoutDialog({
  store, product, qty, checkoutFn, onClose,
}: {
  store: any; product: any; qty: number;
  checkoutFn: (args: { data: any }) => Promise<any>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    customerName: "", customerPhone: "", customerEmail: "",
    zip: "", street: "", number: "", complement: "",
    neighborhood: "", city: "", state: "", notes: "",
  });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const unit = Number(product.discount_price ?? product.price) || 0;
  const total = unit * qty;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true); setErr(null);
    try {
      const res = await checkoutFn({
        data: {
          items: [{ name: product.name, qty, price: unit, productId: product.id }],
          customerName: f.customerName, customerPhone: f.customerPhone,
          customerEmail: f.customerEmail || undefined,
          recipientName: f.customerName, recipientPhone: f.customerPhone,
          zip: f.zip, street: f.street, number: f.number,
          complement: f.complement || undefined,
          neighborhood: f.neighborhood, city: f.city, state: f.state,
          notes: f.notes || undefined,
        },
      });
      setDone(res);
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar pedido.");
    } finally { setSending(false); }
  };

  const inp = "w-full rounded border border-cyan-500/20 bg-[#0a1628] px-3 py-2 text-sm text-white";

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-[#0a1628] text-white">
      <div className="flex items-center gap-2 border-b border-cyan-500/20 px-3 py-3">
        <button onClick={onClose} className="rounded p-2 hover:bg-white/5"><ArrowLeft className="h-5 w-5" /></button>
        <h2 className="text-base font-bold">Compra direta · {store.nome_loja}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {done ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
            <BadgeCheck className="mx-auto h-10 w-10 text-emerald-400" />
            <h3 className="font-bold">Pedido realizado!</h3>
            <p className="text-xs text-slate-300">Acompanhe em Meus Pedidos.</p>
            <button onClick={onClose} className="mt-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold">Fechar</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="rounded border border-cyan-500/20 bg-[#11304f]/40 p-3 text-sm">
              <strong>{product.name}</strong>
              <div className="text-xs text-slate-300 mt-1">{qty}x {BRL(unit)} = <strong className="text-orange-300">{BRL(total)}</strong></div>
            </div>
            <h3 className="text-xs font-semibold uppercase text-cyan-300">Seus dados</h3>
            <input required placeholder="Nome completo" className={inp} value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} />
            <input required placeholder="Telefone" className={inp} value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value })} />
            <input type="email" placeholder="E-mail (opcional)" className={inp} value={f.customerEmail} onChange={(e) => setF({ ...f, customerEmail: e.target.value })} />
            <h3 className="text-xs font-semibold uppercase text-cyan-300 pt-2">Endereço de entrega</h3>
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="CEP" className={inp} value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} />
              <input required placeholder="Número" className={inp} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
            </div>
            <input required placeholder="Rua" className={inp} value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} />
            <input placeholder="Complemento" className={inp} value={f.complement} onChange={(e) => setF({ ...f, complement: e.target.value })} />
            <input required placeholder="Bairro" className={inp} value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="Cidade" className={inp} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
              <input required placeholder="UF" className={inp} maxLength={2} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} />
            </div>
            <textarea placeholder="Observações (opcional)" className={inp + " min-h-[60px]"} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            {err && <p className="text-xs text-red-400">{err}</p>}
            <button type="submit" disabled={sending} className="w-full rounded bg-emerald-500 py-3 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60">
              {sending ? "Enviando…" : `Confirmar pedido · ${BRL(total)}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
