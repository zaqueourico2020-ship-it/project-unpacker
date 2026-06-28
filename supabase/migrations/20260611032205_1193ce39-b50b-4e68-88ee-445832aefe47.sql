CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','owner','partner','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_designated_owner_role()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_email text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email = 'grupogfredevarejistaoficial@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin') ON CONFLICT DO NOTHING;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.ensure_designated_owner_role() TO authenticated;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text, phone text, pix_key text, birthday date,
  level text DEFAULT 'iniciante',
  lifetime_spent numeric(14,2) NOT NULL DEFAULT 0,
  user_type text, cnpj text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile self read"   ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profile self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profile self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  pending_balance   numeric(14,2) NOT NULL DEFAULT 0,
  total_cashback    numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet self read" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL, status text NOT NULL DEFAULT 'completed',
  amount numeric(14,2) NOT NULL, description text, reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wtx self read" ON public.wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.pix_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('deposit','withdraw')),
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  pix_key text, mp_payment_id text,
  qr_code text, qr_code_base64 text, copy_paste text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pix_requests TO authenticated;
GRANT ALL ON public.pix_requests TO service_role;
ALTER TABLE public.pix_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pix self read" ON public.pix_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.transfer_balance(_to_user uuid, _amount numeric, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from uuid := auth.uid(); v_from_wallet uuid; v_to_wallet uuid; v_ref uuid := gen_random_uuid(); v_bal numeric;
BEGIN
  IF v_from IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF v_from = _to_user THEN RAISE EXCEPTION 'cannot transfer to self'; END IF;
  SELECT id, available_balance INTO v_from_wallet, v_bal FROM public.wallets WHERE user_id = v_from FOR UPDATE;
  IF v_from_wallet IS NULL OR v_bal < _amount THEN RAISE EXCEPTION 'insufficient funds'; END IF;
  SELECT id INTO v_to_wallet FROM public.wallets WHERE user_id = _to_user FOR UPDATE;
  IF v_to_wallet IS NULL THEN INSERT INTO public.wallets (user_id) VALUES (_to_user) RETURNING id INTO v_to_wallet; END IF;
  UPDATE public.wallets SET available_balance = available_balance - _amount, updated_at = now() WHERE id = v_from_wallet;
  UPDATE public.wallets SET available_balance = available_balance + _amount, updated_at = now() WHERE id = v_to_wallet;
  INSERT INTO public.wallet_transactions (wallet_id, user_id, type, status, amount, description, reference_id) VALUES
    (v_from_wallet, v_from, 'transfer_out','completed', -_amount, COALESCE(_note,'Transferência'), v_ref::text),
    (v_to_wallet, _to_user, 'transfer_in','completed', _amount, COALESCE(_note,'Transferência recebida'), v_ref::text);
  RETURN v_ref;
END $$;
GRANT EXECUTE ON FUNCTION public.transfer_balance(uuid, numeric, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'PJ',
  nome text NOT NULL, documento text UNIQUE NOT NULL,
  email text, telefone text,
  endereco jsonb DEFAULT '{}'::jsonb,
  nome_loja text NOT NULL, slug text UNIQUE NOT NULL,
  logo_url text, banner_url text, descricao text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  verified boolean NOT NULL DEFAULT false,
  reliable_shipping boolean NOT NULL DEFAULT false,
  level_manual text, commission_rate numeric(5,2),
  rejection_reason text, approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.partners TO authenticated;
GRANT SELECT ON public.partners TO anon;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners public read approved" ON public.partners FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY "partners self read"   ON public.partners FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "partners self update" ON public.partners FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "partners self insert" ON public.partners FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "partners admin all"   ON public.partners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.activate_partner_self()
RETURNS TABLE(slug text, created boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_name text; v_phone text; v_doc text; v_slug text; v_existing public.partners;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO v_existing FROM public.partners WHERE user_id = v_uid;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status <> 'approved' THEN
      UPDATE public.partners SET status='approved', approved_at=now(), rejection_reason=NULL WHERE id=v_existing.id;
    END IF;
    INSERT INTO public.user_roles(user_id, role) VALUES (v_uid,'partner') ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT v_existing.slug, false; RETURN;
  END IF;
  SELECT email, COALESCE(raw_user_meta_data->>'full_name', split_part(email,'@',1)), COALESCE(raw_user_meta_data->>'phone','')
    INTO v_email, v_name, v_phone FROM auth.users WHERE id = v_uid;
  v_doc := 'auto-' || replace(v_uid::text,'-','');
  v_slug := regexp_replace(lower(coalesce(v_name,'loja')),'[^a-z0-9]+','-','g');
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN v_slug := 'loja'; END IF;
  IF EXISTS (SELECT 1 FROM public.partners WHERE slug = v_slug) THEN v_slug := v_slug || '-' || substring(v_uid::text,1,6); END IF;
  INSERT INTO public.partners (user_id, tipo, nome, documento, email, telefone, nome_loja, slug, status, approved_at)
  VALUES (v_uid,'PF', COALESCE(v_name,'Parceiro GF'), v_doc, v_email, v_phone, COALESCE('Loja ' || v_name, 'Loja GF'), v_slug, 'approved', now());
  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid,'partner') ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT v_slug, true;
END $$;
GRANT EXECUTE ON FUNCTION public.activate_partner_self() TO authenticated;

CREATE TABLE IF NOT EXISTS public.partner_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL, description text, sku text,
  price numeric(14,2) NOT NULL DEFAULT 0, cost_price numeric(14,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  category text, subcategory text, image_url text,
  active boolean NOT NULL DEFAULT true,
  approval_status text NOT NULL DEFAULT 'approved',
  weight_kg numeric(10,3), length_cm numeric(10,2), width_cm numeric(10,2), height_cm numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_products TO authenticated;
GRANT ALL ON public.partner_products TO service_role;
ALTER TABLE public.partner_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp public read active" ON public.partner_products FOR SELECT TO anon, authenticated USING (active = true AND approval_status = 'approved');
CREATE POLICY "pp owner all" ON public.partner_products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "pp admin all" ON public.partner_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.decrement_partner_stock(_id uuid, _qty integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.partner_products SET stock_quantity = GREATEST(0, stock_quantity - _qty), updated_at = now() WHERE id = _id; END $$;
GRANT EXECUTE ON FUNCTION public.decrement_partner_stock(uuid, integer) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, sku text,
  price numeric(14,2) NOT NULL DEFAULT 0, cost_price numeric(14,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  image_url text, active boolean NOT NULL DEFAULT true,
  category text, subcategory text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products public read active" ON public.products FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "products admin all" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text, customer_phone text, customer_email text,
  recipient_name text, recipient_phone text,
  zip text, street text, number text, complement text,
  neighborhood text, city text, state text, reference text, notes text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  cost_total numeric(14,2) NOT NULL DEFAULT 0,
  profit numeric(14,2) NOT NULL DEFAULT 0,
  coupon_code text, status text NOT NULL DEFAULT 'pending',
  payment_method text, payment_type text,
  mp_preference_id text, mp_payment_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT INSERT ON public.orders TO anon;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders self read" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "orders admin all" ON public.orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.partner_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_user_id uuid,
  customer_name text, customer_phone text, customer_email text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  shipping_address jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  shipping_cost numeric(14,2) NOT NULL DEFAULT 0,
  commission_rate numeric(5,2) NOT NULL DEFAULT 12,
  commission_amount numeric(14,2) NOT NULL DEFAULT 0,
  partner_net numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  tracking_code text, shipped_at timestamptz, delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, partner_id)
);
GRANT SELECT, INSERT, UPDATE ON public.partner_orders TO authenticated;
GRANT ALL ON public.partner_orders TO service_role;
ALTER TABLE public.partner_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po partner read" ON public.partner_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "po partner update" ON public.partner_orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "po buyer read" ON public.partner_orders FOR SELECT TO authenticated USING (customer_user_id = auth.uid());
CREATE POLICY "po admin all" ON public.partner_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));