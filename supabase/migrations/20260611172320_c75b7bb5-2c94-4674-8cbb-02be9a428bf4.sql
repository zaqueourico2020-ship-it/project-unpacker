CREATE TABLE IF NOT EXISTS public.admin_wallet (
  id text PRIMARY KEY DEFAULT 'gf',
  balance numeric(14,2) NOT NULL DEFAULT 0,
  total_collected numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_wallet TO authenticated;
GRANT ALL ON public.admin_wallet TO service_role;
ALTER TABLE public.admin_wallet ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aw admin read" ON public.admin_wallet;
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
DROP POLICY IF EXISTS "awtx admin read" ON public.admin_wallet_transactions;
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
DROP POLICY IF EXISTS "fal admin read" ON public.financial_audit_logs;
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