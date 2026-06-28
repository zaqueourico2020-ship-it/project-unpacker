CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','owner','partner','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, full_name text, phone text, pix_key text, birthday date,
  level text DEFAULT 'iniciante', lifetime_spent numeric(14,2) NOT NULL DEFAULT 0, user_type text, cnpj text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated; GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profile self read" ON public.profiles; DROP POLICY IF EXISTS "profile self update" ON public.profiles; DROP POLICY IF EXISTS "profile self insert" ON public.profiles;
CREATE POLICY "profile self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profile self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profile self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available_balance numeric(14,2) NOT NULL DEFAULT 0, pending_balance numeric(14,2) NOT NULL DEFAULT 0,
  total_cashback numeric(14,2) NOT NULL DEFAULT 0, blocked_balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.wallets TO authenticated; GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet self read" ON public.wallets;
CREATE POLICY "wallet self read" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'PJ', nome text NOT NULL, documento text UNIQUE NOT NULL, email text, telefone text,
  endereco jsonb DEFAULT '{}'::jsonb, nome_loja text NOT NULL, slug text UNIQUE NOT NULL,
  logo_url text, banner_url text, cover_url text, store_banners jsonb NOT NULL DEFAULT '[]'::jsonb, descricao text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected','suspended')),
  verified boolean NOT NULL DEFAULT false, reliable_shipping boolean NOT NULL DEFAULT false, direct_checkout_enabled boolean NOT NULL DEFAULT true,
  level_manual text, commission_rate numeric(5,2), rejection_reason text, approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partners TO anon; GRANT SELECT, INSERT, UPDATE ON public.partners TO authenticated; GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partners public read approved" ON public.partners; DROP POLICY IF EXISTS "partners self read" ON public.partners; DROP POLICY IF EXISTS "partners self update" ON public.partners; DROP POLICY IF EXISTS "partners self insert" ON public.partners; DROP POLICY IF EXISTS "partners admin all" ON public.partners;
CREATE POLICY "partners public read approved" ON public.partners FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY "partners self read" ON public.partners FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "partners self update" ON public.partners FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "partners self insert" ON public.partners FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "partners admin all" ON public.partners FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.activate_partner_self()
RETURNS TABLE(slug text, created boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_name text; v_phone text; v_doc text; v_slug text; v_existing public.partners;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO v_existing FROM public.partners WHERE user_id = v_uid;
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.partners SET status='approved', approved_at=COALESCE(approved_at, now()), rejection_reason=NULL WHERE id=v_existing.id;
    INSERT INTO public.user_roles(user_id, role) VALUES (v_uid,'partner') ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT v_existing.slug, false; RETURN;
  END IF;
  SELECT email, COALESCE(raw_user_meta_data->>'full_name', split_part(email,'@',1)), COALESCE(raw_user_meta_data->>'phone','') INTO v_email, v_name, v_phone FROM auth.users WHERE id = v_uid;
  v_doc := 'auto-' || replace(v_uid::text,'-','');
  v_slug := trim(both '-' from regexp_replace(lower(coalesce(v_name,'loja')),'[^a-z0-9]+','-','g'));
  IF v_slug = '' THEN v_slug := 'loja'; END IF;
  IF EXISTS (SELECT 1 FROM public.partners WHERE slug = v_slug) THEN v_slug := v_slug || '-' || substring(v_uid::text,1,6); END IF;
  INSERT INTO public.partners (user_id,tipo,nome,documento,email,telefone,nome_loja,slug,status,approved_at)
  VALUES (v_uid,'PF',COALESCE(v_name,'Parceiro GF'),v_doc,v_email,v_phone,COALESCE('Loja ' || v_name,'Loja GF'),v_slug,'approved',now());
  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid,'partner') ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT v_slug, true;
END $$;
GRANT EXECUTE ON FUNCTION public.activate_partner_self() TO authenticated;

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, sku text, description text, brand text,
  price numeric(14,2) NOT NULL DEFAULT 0, discount_price numeric(14,2), cost_price numeric(14,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0, image_url text, images text[] NOT NULL DEFAULT '{}', notes text,
  active boolean NOT NULL DEFAULT true, category text, subcategory text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon; GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated; GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products public read active" ON public.products; DROP POLICY IF EXISTS "products admin all" ON public.products;
CREATE POLICY "products public read active" ON public.products FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "products admin all" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.partner_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL, description text, sku text, brand text, price numeric(14,2) NOT NULL DEFAULT 0, discount_price numeric(14,2), cost_price numeric(14,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0, category text, subcategory text, image_url text, images text[] NOT NULL DEFAULT '{}', notes text,
  active boolean NOT NULL DEFAULT true, approval_status text NOT NULL DEFAULT 'approved', weight_kg numeric(10,3), length_cm numeric(10,2), width_cm numeric(10,2), height_cm numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_products TO anon; GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_products TO authenticated; GRANT ALL ON public.partner_products TO service_role;
ALTER TABLE public.partner_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pp public read active" ON public.partner_products; DROP POLICY IF EXISTS "pp owner all" ON public.partner_products; DROP POLICY IF EXISTS "pp admin all" ON public.partner_products;
CREATE POLICY "pp public read active" ON public.partner_products FOR SELECT TO anon, authenticated USING (active = true AND approval_status = 'approved');
CREATE POLICY "pp owner all" ON public.partner_products FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "pp admin all" ON public.partner_products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_product_id uuid REFERENCES public.partner_products(id) ON DELETE CASCADE, product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL, sku text, price numeric(14,2) NOT NULL DEFAULT 0, discount_price numeric(14,2), stock integer NOT NULL DEFAULT 0,
  image_url text, attributes jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_variants TO anon; GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated; GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pv public read" ON public.product_variants;
CREATE POLICY "pv public read" ON public.product_variants FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text, customer_phone text, customer_email text, recipient_name text, recipient_phone text,
  zip text, street text, number text, complement text, neighborhood text, city text, state text, reference text, notes text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb, subtotal numeric(14,2) NOT NULL DEFAULT 0, discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0, cost_total numeric(14,2) NOT NULL DEFAULT 0, profit numeric(14,2) NOT NULL DEFAULT 0,
  coupon_code text, status text NOT NULL DEFAULT 'pending', payment_method text, payment_type text, mp_preference_id text, mp_payment_id text, paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated; GRANT INSERT ON public.orders TO anon; GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders self read" ON public.orders; DROP POLICY IF EXISTS "orders admin all" ON public.orders;
CREATE POLICY "orders self read" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "orders admin all" ON public.orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.partner_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE, partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_user_id uuid, customer_name text, customer_phone text, customer_email text, items jsonb NOT NULL DEFAULT '[]'::jsonb, shipping_address jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0, total numeric(14,2) NOT NULL DEFAULT 0, shipping_cost numeric(14,2) NOT NULL DEFAULT 0,
  commission_rate numeric(5,2) NOT NULL DEFAULT 12, commission_amount numeric(14,2) NOT NULL DEFAULT 0, partner_net numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', tracking_code text, shipped_at timestamptz, delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id, partner_id)
);
GRANT SELECT, INSERT, UPDATE ON public.partner_orders TO authenticated; GRANT ALL ON public.partner_orders TO service_role;
ALTER TABLE public.partner_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "po partner read" ON public.partner_orders; DROP POLICY IF EXISTS "po partner update" ON public.partner_orders; DROP POLICY IF EXISTS "po buyer read" ON public.partner_orders; DROP POLICY IF EXISTS "po admin all" ON public.partner_orders;
CREATE POLICY "po partner read" ON public.partner_orders FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "po partner update" ON public.partner_orders FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "po buyer read" ON public.partner_orders FOR SELECT TO authenticated USING (customer_user_id = auth.uid());
CREATE POLICY "po admin all" ON public.partner_orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.cashback_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0, used_amount numeric(14,2) NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'active', expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cashback_credits TO authenticated; GRANT ALL ON public.cashback_credits TO service_role;
ALTER TABLE public.cashback_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cc self read" ON public.cashback_credits;
CREATE POLICY "cc self read" ON public.cashback_credits FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.store_state (
  id text PRIMARY KEY, products jsonb NOT NULL DEFAULT '[]'::jsonb, banners jsonb NOT NULL DEFAULT '[]'::jsonb,
  coupons jsonb NOT NULL DEFAULT '[]'::jsonb, settings jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.store_state(id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.store_state TO anon, authenticated; GRANT INSERT, UPDATE ON public.store_state TO authenticated; GRANT ALL ON public.store_state TO service_role;
ALTER TABLE public.store_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store read" ON public.store_state; DROP POLICY IF EXISTS "store admin all" ON public.store_state;
CREATE POLICY "store read" ON public.store_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "store admin all" ON public.store_state FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.partner_payouts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE, partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL, gross_amount numeric(14,2) NOT NULL DEFAULT 0, commission_amount numeric(14,2) NOT NULL DEFAULT 0, net_amount numeric(14,2) NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending', available_at timestamptz, payout_method text, payout_reference text, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.partner_payouts TO authenticated; GRANT ALL ON public.partner_payouts TO service_role; ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payout partner read" ON public.partner_payouts; CREATE POLICY "payout partner read" ON public.partner_payouts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.platform_settings (key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid);
GRANT SELECT ON public.platform_settings TO anon, authenticated; GRANT ALL ON public.platform_settings TO service_role; ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ps read" ON public.platform_settings; CREATE POLICY "ps read" ON public.platform_settings FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.platform_settings(key, value) VALUES ('commission_rate_default','{"rate":12}'::jsonb) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.followers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, partner_id));
GRANT SELECT, INSERT, DELETE ON public.followers TO authenticated; GRANT ALL ON public.followers TO service_role; ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "followers self" ON public.followers; CREATE POLICY "followers self" ON public.followers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.chat_conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, buyer_name text, partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE, product_id uuid, product_name text, last_message text, last_message_at timestamptz NOT NULL DEFAULT now(), buyer_unread integer NOT NULL DEFAULT 0, seller_unread integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO authenticated; GRANT ALL ON public.chat_conversations TO service_role; ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat conv buyer" ON public.chat_conversations; CREATE POLICY "chat conv buyer" ON public.chat_conversations FOR ALL TO authenticated USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE, sender_id uuid NOT NULL, sender_role text NOT NULL, sender_name text, body text, image_url text, read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated; GRANT ALL ON public.chat_messages TO service_role; ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat msg participants" ON public.chat_messages;
CREATE POLICY "chat msg participants" ON public.chat_messages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id AND (c.buyer_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')))) WITH CHECK (EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id AND (c.buyer_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, user_type, cnpj)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.raw_user_meta_data->>'phone',''), COALESCE(NEW.raw_user_meta_data->>'user_type','pessoa_fisica'), NEW.raw_user_meta_data->>'cnpj')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();