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
CREATE POLICY "ch partner read" ON public.commission_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partners p WHERE p.id = partner_id AND p.user_id = auth.uid()));
CREATE POLICY "ch admin all" ON public.commission_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
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
  IF lower(NEW.email) = 'grupogfredevarejistaoficial@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.admin_wallet (
  id text PRIMARY KEY DEFAULT 'gf',
  balance numeric(14,2) NOT NULL DEFAULT 0,
  total_collected numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_wallet TO authenticated;
GRANT ALL ON public.admin_wallet TO service_role;
ALTER TABLE public.admin_wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aw admin read" ON public.admin_wallet FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
INSERT INTO public.admin_wallet(id) VALUES ('gf') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  description text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_wtx_created_idx ON public.admin_wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_wtx_partner_idx ON public.admin_wallet_transactions(partner_id);
CREATE INDEX IF NOT EXISTS admin_wtx_order_idx ON public.admin_wallet_transactions(order_id);
GRANT SELECT ON public.admin_wallet_transactions TO authenticated;
GRANT ALL ON public.admin_wallet_transactions TO service_role;
ALTER TABLE public.admin_wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "awtx admin read" ON public.admin_wallet_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  actor uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL,
  amount numeric(14,2),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_audit_created_idx ON public.financial_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS fin_audit_partner_idx ON public.financial_audit_logs(partner_id);
CREATE INDEX IF NOT EXISTS fin_audit_order_idx ON public.financial_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS fin_audit_event_idx ON public.financial_audit_logs(event);
GRANT SELECT ON public.financial_audit_logs TO authenticated;
GRANT ALL ON public.financial_audit_logs TO service_role;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fal admin read" ON public.financial_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

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
  INSERT INTO public.admin_wallet(id) VALUES ('gf') ON CONFLICT (id) DO NOTHING;
  UPDATE public.admin_wallet
     SET balance = balance + NEW.commission_amount,
         total_collected = total_collected + NEW.commission_amount,
         updated_at = now()
   WHERE id = 'gf';
  INSERT INTO public.admin_wallet_transactions(type, amount, description, order_id, partner_id, partner_order_id, reference_id)
  VALUES ('commission_credit', NEW.commission_amount,
          'Comissão ' || v_rate::text || '% sobre venda', NEW.order_id, NEW.partner_id, NEW.id, NEW.id::text);
  INSERT INTO public.financial_audit_logs(event, order_id, partner_id, partner_order_id, amount, details)
  VALUES ('split_executed', NEW.order_id, NEW.partner_id, NEW.id, NEW.total,
          jsonb_build_object('rate', v_rate, 'gross', NEW.total,
                             'gf_commission', NEW.commission_amount, 'partner_net', NEW.partner_net));
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
    SELECT pp.id, pp.partner_id, pp.net_amount, p.user_id, pp.partner_order_id
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
    INSERT INTO public.financial_audit_logs(event, partner_id, partner_order_id, amount, details)
    VALUES ('payout_released', r.partner_id, r.partner_order_id, r.net_amount,
            jsonb_build_object('payout_id', r.id, 'user_id', v_user));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.release_due_payouts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_user_email(_email text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE lower(email) = lower(_email);
$$;
REVOKE ALL ON FUNCTION public.confirm_user_email(text) FROM public;
REVOKE ALL ON FUNCTION public.confirm_user_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_user_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_user_email(text) TO service_role;