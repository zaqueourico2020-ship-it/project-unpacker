-- Ensure partner store extras exist (cover_url, store_banners, direct_checkout_enabled).
alter table public.partners
  add column if not exists cover_url text,
  add column if not exists store_banners jsonb not null default '[]'::jsonb,
  add column if not exists direct_checkout_enabled boolean not null default true;

alter table public.partner_products
  add column if not exists discount_price numeric(14,2),
  add column if not exists brand text,
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists notes text;
