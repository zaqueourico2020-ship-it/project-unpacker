ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS blocked_balance numeric(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.balance_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid,
  notes text
);
CREATE INDEX IF NOT EXISTS balance_blocks_user_idx ON public.balance_blocks(user_id);
CREATE INDEX IF NOT EXISTS balance_blocks_status_idx ON public.balance_blocks(status);
GRANT SELECT ON public.balance_blocks TO authenticated;
GRANT ALL ON public.balance_blocks TO service_role;
ALTER TABLE public.balance_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bb self read" ON public.balance_blocks;
CREATE POLICY "bb self read" ON public.balance_blocks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "bb admin all" ON public.balance_blocks;
CREATE POLICY "bb admin all" ON public.balance_blocks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TABLE IF NOT EXISTS public.withdrawal_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.pix_requests(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('approved','rejected','paid','reopened')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waa_request_idx ON public.withdrawal_admin_actions(request_id);
CREATE INDEX IF NOT EXISTS waa_created_idx ON public.withdrawal_admin_actions(created_at DESC);
GRANT SELECT ON public.withdrawal_admin_actions TO authenticated;
GRANT ALL ON public.withdrawal_admin_actions TO service_role;
ALTER TABLE public.withdrawal_admin_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "waa admin read" ON public.withdrawal_admin_actions;
CREATE POLICY "waa admin read" ON public.withdrawal_admin_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.notify_financial(
  _user uuid, _kind text, _title text, _body text DEFAULT NULL, _link text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, kind, title, body, link)
  VALUES (_user, _kind, _title, _body, _link);
END $$;
GRANT EXECUTE ON FUNCTION public.notify_financial(uuid,text,text,text,text) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tg_partner_order_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.partners WHERE id = NEW.partner_id;
  IF v_user IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notify_financial(v_user, 'sale_received',
    'Venda recebida',
    'Você vendeu R$ ' || to_char(NEW.total, 'FM999G999G990D00') ||
    '. Comissão GF: R$ ' || to_char(NEW.commission_amount, 'FM999G999G990D00') ||
    '. Líquido pendente: R$ ' || to_char(NEW.partner_net, 'FM999G999G990D00'),
    '/parceiro/financeiro');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS partner_order_notify ON public.partner_orders;
CREATE TRIGGER partner_order_notify AFTER INSERT ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_partner_order_notify();

CREATE OR REPLACE FUNCTION public.tg_pix_request_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'withdraw' THEN
    PERFORM public.notify_financial(NEW.user_id, 'withdraw_requested',
      'Saque solicitado',
      'Saque de R$ ' || to_char(NEW.amount, 'FM999G999G990D00') || ' aguardando aprovação.',
      '/carteira');
  ELSIF NEW.kind = 'deposit' AND NEW.status = 'approved' THEN
    PERFORM public.notify_financial(NEW.user_id, 'deposit_confirmed',
      'Depósito confirmado',
      'Depósito de R$ ' || to_char(NEW.amount, 'FM999G999G990D00') || ' confirmado.',
      '/carteira');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pix_request_notify_ins ON public.pix_requests;
CREATE TRIGGER pix_request_notify_ins AFTER INSERT ON public.pix_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_pix_request_notify();

CREATE OR REPLACE FUNCTION public.tg_pix_request_notify_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.kind = 'deposit' AND NEW.status = 'approved' THEN
    PERFORM public.notify_financial(NEW.user_id, 'deposit_confirmed',
      'Depósito confirmado',
      'Depósito de R$ ' || to_char(NEW.amount, 'FM999G999G990D00') || ' confirmado.',
      '/carteira');
  ELSIF NEW.kind = 'withdraw' AND NEW.status = 'approved' THEN
    PERFORM public.notify_financial(NEW.user_id, 'withdraw_approved',
      'Saque aprovado',
      'Seu saque de R$ ' || to_char(NEW.amount, 'FM999G999G990D00') || ' foi aprovado.',
      '/carteira');
  ELSIF NEW.kind = 'withdraw' AND NEW.status = 'paid' THEN
    PERFORM public.notify_financial(NEW.user_id, 'withdraw_paid',
      'Saque pago',
      'Seu saque de R$ ' || to_char(NEW.amount, 'FM999G999G990D00') || ' foi pago.',
      '/carteira');
  ELSIF NEW.kind = 'withdraw' AND NEW.status = 'rejected' THEN
    PERFORM public.notify_financial(NEW.user_id, 'withdraw_rejected',
      'Saque rejeitado',
      'Seu saque de R$ ' || to_char(NEW.amount, 'FM999G999G990D00') || ' foi rejeitado e o valor retornou à carteira.',
      '/carteira');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pix_request_notify_upd ON public.pix_requests;
CREATE TRIGGER pix_request_notify_upd AFTER UPDATE OF status ON public.pix_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_pix_request_notify_upd();

CREATE OR REPLACE FUNCTION public.tg_wallet_tx_notify_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type IN ('partner_payout_release','release') THEN
    PERFORM public.notify_financial(NEW.user_id, 'balance_released',
      'Saldo liberado',
      'R$ ' || to_char(NEW.amount, 'FM999G999G990D00') || ' liberado em sua carteira.',
      '/carteira');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wallet_tx_notify_release ON public.wallet_transactions;
CREATE TRIGGER wallet_tx_notify_release AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_wallet_tx_notify_release();

CREATE OR REPLACE FUNCTION public.release_pending_friday()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total integer := 0;
BEGIN
  UPDATE public.partner_payouts
     SET available_at = LEAST(COALESCE(available_at, now()), now())
   WHERE status = 'pending';
  v_total := public.release_due_payouts();
  RETURN v_total;
END $$;
GRANT EXECUTE ON FUNCTION public.release_pending_friday() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_pix_withdraw_secure(
  _amount numeric, _pix_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
        v_wallet_id uuid;
        v_avail numeric;
        v_blocked numeric;
        v_req uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  SELECT id, available_balance, COALESCE(blocked_balance,0)
    INTO v_wallet_id, v_avail, v_blocked
    FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
  IF (v_avail - v_blocked) < _amount THEN RAISE EXCEPTION 'insufficient available balance'; END IF;
  UPDATE public.wallets
     SET available_balance = available_balance - _amount,
         updated_at = now()
   WHERE id = v_wallet_id;
  INSERT INTO public.pix_requests(user_id, kind, amount, status, pix_key)
  VALUES (v_user, 'withdraw', _amount, 'pending', _pix_key)
  RETURNING id INTO v_req;
  INSERT INTO public.wallet_transactions(wallet_id, user_id, type, status, amount, description, reference_id)
  VALUES (v_wallet_id, v_user, 'pix_withdraw', 'pending', -_amount,
          'Saque PIX para ' || _pix_key, v_req::text);
  INSERT INTO public.financial_audit_logs(event, actor, amount, details)
  VALUES ('withdraw_requested', v_user, _amount, jsonb_build_object('request_id', v_req, 'pix_key', _pix_key));
  RETURN v_req;
END $$;
GRANT EXECUTE ON FUNCTION public.request_pix_withdraw_secure(numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_withdrawal_action(
  _request_id uuid, _action text, _note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid();
        v_req public.pix_requests;
        v_wallet_id uuid;
BEGIN
  IF NOT (public.has_role(v_admin,'admin') OR public.has_role(v_admin,'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _action NOT IN ('approved','rejected','paid') THEN RAISE EXCEPTION 'invalid action'; END IF;
  SELECT * INTO v_req FROM public.pix_requests WHERE id = _request_id FOR UPDATE;
  IF v_req.id IS NULL OR v_req.kind <> 'withdraw' THEN RAISE EXCEPTION 'request not found'; END IF;
  IF _action = 'rejected' AND v_req.status NOT IN ('paid','rejected') THEN
    SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_req.user_id FOR UPDATE;
    IF v_wallet_id IS NOT NULL THEN
      UPDATE public.wallets SET available_balance = available_balance + v_req.amount, updated_at = now()
       WHERE id = v_wallet_id;
      INSERT INTO public.wallet_transactions(wallet_id, user_id, type, status, amount, description, reference_id)
      VALUES (v_wallet_id, v_req.user_id, 'withdraw_refund','completed', v_req.amount,
              'Estorno de saque PIX rejeitado', v_req.id::text);
    END IF;
  END IF;
  UPDATE public.pix_requests SET status = _action, updated_at = now() WHERE id = _request_id;
  IF _action = 'paid' THEN
    UPDATE public.wallet_transactions SET status='completed'
      WHERE reference_id = _request_id::text AND type='pix_withdraw';
  END IF;
  INSERT INTO public.withdrawal_admin_actions(request_id, admin_id, action, note)
  VALUES (_request_id, v_admin, _action, _note);
  INSERT INTO public.financial_audit_logs(event, actor, amount, details)
  VALUES ('withdraw_' || _action, v_admin, v_req.amount,
          jsonb_build_object('request_id', _request_id, 'user_id', v_req.user_id, 'note', _note));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_withdrawal_action(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_block_balance(
  _user uuid, _amount numeric, _reason text, _order_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_id uuid;
BEGIN
  IF NOT (public.has_role(v_admin,'admin') OR public.has_role(v_admin,'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  INSERT INTO public.balance_blocks(user_id, amount, reason, related_order_id, created_by)
  VALUES (_user, _amount, _reason, _order_id, v_admin) RETURNING id INTO v_id;
  UPDATE public.wallets SET blocked_balance = COALESCE(blocked_balance,0) + _amount, updated_at = now()
   WHERE user_id = _user;
  INSERT INTO public.financial_audit_logs(event, actor, amount, details)
  VALUES ('balance_blocked', v_admin, _amount,
          jsonb_build_object('user_id', _user, 'reason', _reason, 'block_id', v_id));
  PERFORM public.notify_financial(_user, 'balance_blocked',
    'Valor bloqueado',
    'R$ ' || to_char(_amount,'FM999G999G990D00') || ' bloqueado: ' || _reason, '/carteira');
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_block_balance(uuid, numeric, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_release_block(_block_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_block public.balance_blocks;
BEGIN
  IF NOT (public.has_role(v_admin,'admin') OR public.has_role(v_admin,'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_block FROM public.balance_blocks WHERE id = _block_id FOR UPDATE;
  IF v_block.id IS NULL OR v_block.status <> 'active' THEN RAISE EXCEPTION 'block not found'; END IF;
  UPDATE public.balance_blocks SET status='released', released_at=now(), released_by=v_admin, notes=_note
   WHERE id = _block_id;
  UPDATE public.wallets SET blocked_balance = GREATEST(0, COALESCE(blocked_balance,0) - v_block.amount), updated_at=now()
   WHERE user_id = v_block.user_id;
  INSERT INTO public.financial_audit_logs(event, actor, amount, details)
  VALUES ('balance_block_released', v_admin, v_block.amount,
          jsonb_build_object('user_id', v_block.user_id, 'block_id', _block_id, 'note', _note));
  PERFORM public.notify_financial(v_block.user_id, 'balance_unblocked',
    'Valor desbloqueado',
    'R$ ' || to_char(v_block.amount,'FM999G999G990D00') || ' desbloqueado.', '/carteira');
END $$;
GRANT EXECUTE ON FUNCTION public.admin_release_block(uuid, text) TO authenticated;