CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','owner','partner','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
DROP POLICY IF EXISTS "profile self read"   ON public.profiles;
DROP POLICY IF EXISTS "profile self update" ON public.profiles;
DROP POLICY IF EXISTS "profile self insert" ON public.profiles;
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
DROP POLICY IF EXISTS "wallet self read" ON public.wallets;
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
DROP POLICY IF EXISTS "wtx self read" ON public.wallet_transactions;
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
DROP POLICY IF EXISTS "pix self read" ON public.pix_requests;
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
DROP POLICY IF EXISTS "partners public read approved" ON public.partners;
DROP POLICY IF EXISTS "partners self read"   ON public.partners;
DROP POLICY IF EXISTS "partners self update" ON public.partners;
DROP POLICY IF EXISTS "partners self insert" ON public.partners;
DROP POLICY IF EXISTS "partners admin all"   ON public.partners;
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
DROP POLICY IF EXISTS "pp public read active" ON public.partner_products;
DROP POLICY IF EXISTS "pp owner all" ON public.partner_products;
DROP POLICY IF EXISTS "pp admin all" ON public.partner_products;
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
DROP POLICY IF EXISTS "products public read active" ON public.products;
DROP POLICY IF EXISTS "products admin all" ON public.products;
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
DROP POLICY IF EXISTS "orders self read" ON public.orders;
DROP POLICY IF EXISTS "orders admin all" ON public.orders;
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
DROP POLICY IF EXISTS "po partner read" ON public.partner_orders;
DROP POLICY IF EXISTS "po partner update" ON public.partner_orders;
DROP POLICY IF EXISTS "po buyer read" ON public.partner_orders;
DROP POLICY IF EXISTS "po admin all" ON public.partner_orders;
CREATE POLICY "po partner read" ON public.partner_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "po partner update" ON public.partner_orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "po buyer read" ON public.partner_orders FOR SELECT TO authenticated USING (customer_user_id = auth.uid());
CREATE POLICY "po admin all" ON public.partner_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  commission_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz,
  payout_method text, payout_reference text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.partner_payouts TO authenticated;
GRANT ALL ON public.partner_payouts TO service_role;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payout partner read" ON public.partner_payouts;
DROP POLICY IF EXISTS "payout partner insert" ON public.partner_payouts;
DROP POLICY IF EXISTS "payout admin all" ON public.partner_payouts;
CREATE POLICY "payout partner read" ON public.partner_payouts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "payout partner insert" ON public.partner_payouts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "payout admin all" ON public.partner_payouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  gf_commission numeric(14,2) NOT NULL DEFAULT 0,
  partner_net numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales admin all" ON public.sales;
CREATE POLICY "sales admin all" ON public.sales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.commission_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL,
  base_amount numeric(14,2) NOT NULL DEFAULT 0,
  commission_amount numeric(14,2) NOT NULL DEFAULT 0,
  partner_net numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.commission_history TO authenticated;
GRANT ALL ON public.commission_history TO service_role;
ALTER TABLE public.commission_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ch partner read" ON public.commission_history;
DROP POLICY IF EXISTS "ch admin all" ON public.commission_history;
CREATE POLICY "ch partner read" ON public.commission_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "ch admin all" ON public.commission_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.tg_partner_order_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric := COALESCE(NEW.commission_rate, 12);
        v_commission numeric := ROUND(NEW.total * v_rate / 100.0, 2);
        v_net numeric := ROUND(NEW.total - v_commission, 2);
BEGIN
  IF NEW.commission_amount = 0 THEN
    UPDATE public.partner_orders SET commission_rate = v_rate, commission_amount = v_commission, partner_net = v_net WHERE id = NEW.id;
    NEW.commission_amount := v_commission; NEW.partner_net := v_net;
  END IF;
  INSERT INTO public.sales (order_id, partner_id, gross_amount, gf_commission, partner_net)
  VALUES (NEW.order_id, NEW.partner_id, NEW.total, NEW.commission_amount, NEW.partner_net);
  INSERT INTO public.commission_history (partner_id, partner_order_id, base_amount, commission_amount, partner_net, status)
  VALUES (NEW.partner_id, NEW.id, NEW.total, NEW.commission_amount, NEW.partner_net, 'pending');
  IF NOT EXISTS (SELECT 1 FROM public.partner_payouts WHERE partner_order_id = NEW.id) THEN
    INSERT INTO public.partner_payouts (partner_id, partner_order_id, gross_amount, commission_amount, net_amount, status, available_at)
    VALUES (NEW.partner_id, NEW.id, NEW.total, NEW.commission_amount, NEW.partner_net, 'pending', now() + interval '7 days');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS partner_order_split_commission ON public.partner_orders;
CREATE TRIGGER partner_order_split_commission AFTER INSERT ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_partner_order_after_insert();

CREATE OR REPLACE FUNCTION public.tg_partner_order_on_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
    UPDATE public.commission_history SET status = 'released' WHERE partner_order_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS partner_order_on_delivered ON public.partner_orders;
CREATE TRIGGER partner_order_on_delivered AFTER UPDATE OF status ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_partner_order_on_delivered();

CREATE OR REPLACE FUNCTION public.release_due_payouts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_count integer := 0; v_wallet uuid; v_user uuid;
BEGIN
  FOR r IN
    SELECT pp.id, pp.partner_id, pp.net_amount, p.user_id
      FROM public.partner_payouts pp JOIN public.partners p ON p.id = pp.partner_id
     WHERE pp.status = 'pending' AND pp.available_at IS NOT NULL
       AND pp.available_at <= now() AND pp.net_amount > 0
  LOOP
    v_user := r.user_id;
    SELECT id INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
    IF v_wallet IS NULL THEN INSERT INTO public.wallets(user_id) VALUES (v_user) RETURNING id INTO v_wallet; END IF;
    UPDATE public.wallets SET available_balance = available_balance + r.net_amount, updated_at = now() WHERE id = v_wallet;
    INSERT INTO public.wallet_transactions(wallet_id, user_id, type, status, amount, description, reference_id)
    VALUES (v_wallet, v_user, 'partner_payout_release','completed', r.net_amount, 'Liberação automática (7 dias)', r.id::text);
    UPDATE public.partner_payouts SET status = 'available', updated_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.release_due_payouts() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ps read" ON public.platform_settings;
DROP POLICY IF EXISTS "ps admin all" ON public.platform_settings;
CREATE POLICY "ps read" ON public.platform_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ps admin all" ON public.platform_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
INSERT INTO public.platform_settings(key, value) VALUES ('commission_rate_default','{"rate":12}'::jsonb) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cashback_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, min_spent numeric(14,2) NOT NULL,
  cashback_rate numeric(5,2) NOT NULL DEFAULT 10,
  perks jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.cashback_levels TO anon, authenticated;
GRANT ALL ON public.cashback_levels TO service_role;
ALTER TABLE public.cashback_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cl read" ON public.cashback_levels;
CREATE POLICY "cl read" ON public.cashback_levels FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.cashback_levels(name, min_spent, cashback_rate) VALUES
 ('Iniciante',0,10),('Bronze',500,11),('Prata',2000,12),('Ouro',5000,13),('Diamante',15000,15)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cashback_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  used_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cashback_credits TO authenticated;
GRANT ALL ON public.cashback_credits TO service_role;
ALTER TABLE public.cashback_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cc self read" ON public.cashback_credits;
DROP POLICY IF EXISTS "cc self update" ON public.cashback_credits;
DROP POLICY IF EXISTS "cc admin all" ON public.cashback_credits;
CREATE POLICY "cc self read" ON public.cashback_credits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "cc self update" ON public.cashback_credits FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "cc admin all" ON public.cashback_credits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL, title text NOT NULL, body text, link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif self read" ON public.notifications;
DROP POLICY IF EXISTS "notif self update" ON public.notifications;
CREATE POLICY "notif self read" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif self update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_name text,
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  product_id uuid, product_name text,
  last_message text, last_message_at timestamptz NOT NULL DEFAULT now(),
  buyer_unread integer NOT NULL DEFAULT 0,
  seller_unread integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_conv_unique_with_partner ON public.chat_conversations(buyer_id, partner_id) WHERE partner_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_conv_unique_official ON public.chat_conversations(buyer_id) WHERE partner_id IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat conv buyer" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat conv seller" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat conv admin" ON public.chat_conversations;
CREATE POLICY "chat conv buyer" ON public.chat_conversations FOR ALL TO authenticated
  USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "chat conv seller" ON public.chat_conversations FOR ALL TO authenticated
  USING (partner_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()))
  WITH CHECK (partner_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "chat conv admin" ON public.chat_conversations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL, sender_role text NOT NULL, sender_name text,
  body text, image_url text, read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat msg participants" ON public.chat_messages;
CREATE POLICY "chat msg participants" ON public.chat_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id
            AND (c.buyer_id = auth.uid()
                 OR (c.partner_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = c.partner_id AND p.user_id = auth.uid()))
                 OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id
            AND (c.buyer_id = auth.uid()
                 OR (c.partner_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = c.partner_id AND p.user_id = auth.uid()))
                 OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))));

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text, rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text, photos text[] DEFAULT '{}', videos text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_reviews TO anon;
GRANT SELECT, INSERT ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr public read" ON public.product_reviews;
DROP POLICY IF EXISTS "pr self insert" ON public.product_reviews;
CREATE POLICY "pr public read" ON public.product_reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pr self insert" ON public.product_reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.store_state (
  id text PRIMARY KEY,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  banners jsonb NOT NULL DEFAULT '[]'::jsonb,
  coupons jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.store_state(id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.store_state TO anon, authenticated;
GRANT INSERT, UPDATE ON public.store_state TO authenticated;
GRANT ALL ON public.store_state TO service_role;
ALTER TABLE public.store_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store read" ON public.store_state;
DROP POLICY IF EXISTS "store admin all" ON public.store_state;
CREATE POLICY "store read" ON public.store_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "store admin all" ON public.store_state FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, user_type, cnpj)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    COALESCE(NEW.raw_user_meta_data->>'phone',''),
    COALESCE(NEW.raw_user_meta_data->>'user_type','pessoa_fisica'),
    NEW.raw_user_meta_data->>'cnpj')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, full_name, phone, user_type, cnpj)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name',''), COALESCE(u.raw_user_meta_data->>'phone',''),
       COALESCE(u.raw_user_meta_data->>'user_type','pessoa_fisica'), u.raw_user_meta_data->>'cnpj'
  FROM auth.users u ON CONFLICT (id) DO NOTHING;
INSERT INTO public.wallets (user_id) SELECT id FROM auth.users ON CONFLICT (user_id) DO NOTHING;