CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  blocked_balance   numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS blocked_balance numeric(14,2) NOT NULL DEFAULT 0;
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

ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS level_manual text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2);
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS store_banners jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS direct_checkout_enabled boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.auto_approve_partner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.status := 'approved';
  IF NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS partners_auto_approve ON public.partners;
CREATE TRIGGER partners_auto_approve BEFORE INSERT ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.auto_approve_partner();

CREATE OR REPLACE FUNCTION public.grant_partner_role_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.user_id, 'partner'::public.app_role) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS partners_grant_role ON public.partners;
CREATE TRIGGER partners_grant_role AFTER INSERT ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.grant_partner_role_on_insert();

CREATE TABLE IF NOT EXISTS public.partner_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL, description text, sku text, brand text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  discount_price numeric(14,2),
  cost_price numeric(14,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  category text, subcategory text, image_url text,
  images text[] NOT NULL DEFAULT '{}',
  notes text,
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
  name text NOT NULL, sku text, description text, brand text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  discount_price numeric(14,2),
  cost_price numeric(14,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  image_url text, images text[] NOT NULL DEFAULT '{}',
  notes text,
  active boolean NOT NULL DEFAULT true,
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

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_product_id uuid REFERENCES public.partner_products(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL, sku text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  discount_price numeric(14,2),
  stock integer NOT NULL DEFAULT 0,
  image_url text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pv public read" ON public.product_variants;
DROP POLICY IF EXISTS "pv owner all"   ON public.product_variants;
DROP POLICY IF EXISTS "pv admin all"   ON public.product_variants;
CREATE POLICY "pv public read" ON public.product_variants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pv owner all" ON public.product_variants FOR ALL TO authenticated
  USING (partner_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.partner_products pp JOIN public.partners p ON p.id = pp.partner_id
     WHERE pp.id = partner_product_id AND p.user_id = auth.uid()))
  WITH CHECK (partner_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.partner_products pp JOIN public.partners p ON p.id = pp.partner_id
     WHERE pp.id = partner_product_id AND p.user_id = auth.uid()));
CREATE POLICY "pv admin all" ON public.product_variants FOR ALL TO authenticated
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
DROP POLICY IF EXISTS "payout admin all" ON public.partner_payouts;
CREATE POLICY "payout partner read" ON public.partner_payouts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
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

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ps read" ON public.platform_settings;
DROP POLICY IF EXISTS "ps admin all" ON public.platform_settings;
CREATE POLICY "ps read" ON public.platform_settings FOR SELECT TO anon, authenticated USING (true);
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
CREATE POLICY "cc self read" ON public.cashback_credits FOR SELECT TO authenticated USING (auth.uid() = user_id);

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

CREATE TABLE IF NOT EXISTS public.followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id)
);
GRANT SELECT, INSERT, DELETE ON public.followers TO authenticated;
GRANT ALL ON public.followers TO service_role;
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "followers self" ON public.followers;
CREATE POLICY "followers self" ON public.followers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text, description text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "disp buyer" ON public.disputes;
DROP POLICY IF EXISTS "disp partner" ON public.disputes;
DROP POLICY IF EXISTS "disp admin" ON public.disputes;
CREATE POLICY "disp buyer" ON public.disputes FOR ALL TO authenticated USING (buyer_id = auth.uid()) WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "disp partner" ON public.disputes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "disp admin" ON public.disputes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.dispute_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  sender_id uuid, sender_role text, body text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.dispute_messages TO authenticated;
GRANT ALL ON public.dispute_messages TO service_role;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dm participants" ON public.dispute_messages;
CREATE POLICY "dm participants" ON public.dispute_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.disputes d WHERE d.id = dispute_id AND (d.buyer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.partners p WHERE p.id = d.partner_id AND p.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))))
  WITH CHECK (sender_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.balance_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reason text, released boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.balance_blocks TO authenticated;
GRANT ALL ON public.balance_blocks TO service_role;
ALTER TABLE public.balance_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bb self" ON public.balance_blocks;
DROP POLICY IF EXISTS "bb admin" ON public.balance_blocks;
CREATE POLICY "bb self" ON public.balance_blocks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bb admin" ON public.balance_blocks FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, action text NOT NULL, entity text, entity_id text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.financial_audit_logs TO authenticated;
GRANT ALL ON public.financial_audit_logs TO service_role;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fal admin" ON public.financial_audit_logs;
CREATE POLICY "fal admin" ON public.financial_audit_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.admin_wallet (
  id text PRIMARY KEY DEFAULT 'singleton',
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.admin_wallet(id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.admin_wallet TO authenticated;
GRANT ALL ON public.admin_wallet TO service_role;
ALTER TABLE public.admin_wallet ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aw admin" ON public.admin_wallet;
CREATE POLICY "aw admin" ON public.admin_wallet FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.admin_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, amount numeric(14,2) NOT NULL DEFAULT 0,
  description text, reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_wallet_transactions TO authenticated;
GRANT ALL ON public.admin_wallet_transactions TO service_role;
ALTER TABLE public.admin_wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "awt admin" ON public.admin_wallet_transactions;
CREATE POLICY "awt admin" ON public.admin_wallet_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

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

NOTIFY pgrst, 'reload schema';