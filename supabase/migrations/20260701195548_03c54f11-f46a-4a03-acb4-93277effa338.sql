
-- pix_requests
CREATE TABLE IF NOT EXISTS public.pix_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('deposit','withdraw')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending',
  pix_key TEXT,
  mp_payment_id TEXT,
  qr_code TEXT,
  qr_code_base64 TEXT,
  copy_paste TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pix_requests TO authenticated;
GRANT ALL ON public.pix_requests TO service_role;
ALTER TABLE public.pix_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pix self read" ON public.pix_requests;
CREATE POLICY "pix self read" ON public.pix_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- wallet_transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wtx self read" ON public.wallet_transactions;
CREATE POLICY "wtx self read" ON public.wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif self" ON public.notifications;
CREATE POLICY "notif self" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif self upd" ON public.notifications;
CREATE POLICY "notif self upd" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- cashback_levels (used by getWallet)
CREATE TABLE IF NOT EXISTS public.cashback_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  min_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
  percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cashback_levels TO authenticated, anon;
GRANT ALL ON public.cashback_levels TO service_role;
ALTER TABLE public.cashback_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "levels public read" ON public.cashback_levels;
CREATE POLICY "levels public read" ON public.cashback_levels FOR SELECT USING (true);

-- Secure withdraw RPC: validates balance and creates pix_requests + debits wallet atomically
CREATE OR REPLACE FUNCTION public.request_pix_withdraw_secure(_amount NUMERIC, _pix_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet public.wallets;
  v_req_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF _pix_key IS NULL OR length(trim(_pix_key)) < 3 THEN RAISE EXCEPTION 'invalid pix key'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_wallet.id IS NULL THEN
    INSERT INTO public.wallets(user_id) VALUES (v_uid) RETURNING * INTO v_wallet;
  END IF;

  IF (v_wallet.available_balance - COALESCE(v_wallet.blocked_balance,0)) < _amount THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  UPDATE public.wallets
    SET available_balance = available_balance - _amount, updated_at = now()
    WHERE id = v_wallet.id;

  INSERT INTO public.pix_requests(user_id, kind, amount, status, pix_key)
  VALUES (v_uid, 'withdraw', _amount, 'pending', trim(_pix_key))
  RETURNING id INTO v_req_id;

  INSERT INTO public.wallet_transactions(wallet_id, user_id, type, status, amount, description, reference_id)
  VALUES (v_wallet.id, v_uid, 'pix_withdraw', 'pending', -_amount, 'Saque PIX solicitado', v_req_id);

  RETURN v_req_id;
END $$;

GRANT EXECUTE ON FUNCTION public.request_pix_withdraw_secure(NUMERIC, TEXT) TO authenticated;

-- Transfer RPC
CREATE OR REPLACE FUNCTION public.transfer_balance(_to_user UUID, _amount NUMERIC, _note TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_from public.wallets;
  v_to public.wallets;
  v_ref UUID := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _to_user = v_uid THEN RAISE EXCEPTION 'cannot transfer to self'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;

  SELECT * INTO v_from FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_from.id IS NULL OR (v_from.available_balance - COALESCE(v_from.blocked_balance,0)) < _amount THEN
    RAISE EXCEPTION 'insufficient balance';
  END IF;

  SELECT * INTO v_to FROM public.wallets WHERE user_id = _to_user FOR UPDATE;
  IF v_to.id IS NULL THEN
    INSERT INTO public.wallets(user_id) VALUES (_to_user) RETURNING * INTO v_to;
  END IF;

  UPDATE public.wallets SET available_balance = available_balance - _amount, updated_at = now() WHERE id = v_from.id;
  UPDATE public.wallets SET available_balance = available_balance + _amount, updated_at = now() WHERE id = v_to.id;

  INSERT INTO public.wallet_transactions(wallet_id, user_id, type, status, amount, description, reference_id)
  VALUES (v_from.id, v_uid, 'transfer_out', 'completed', -_amount, COALESCE(_note,'Transferência enviada'), v_ref);

  INSERT INTO public.wallet_transactions(wallet_id, user_id, type, status, amount, description, reference_id)
  VALUES (v_to.id, _to_user, 'transfer_in', 'completed', _amount, COALESCE(_note,'Transferência recebida'), v_ref);

  RETURN v_ref;
END $$;

GRANT EXECUTE ON FUNCTION public.transfer_balance(UUID, NUMERIC, TEXT) TO authenticated;

-- Ensure wallet auto-created on signup (already handled by handle_new_user trigger, but confirm trigger exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Backfill wallets for existing users
INSERT INTO public.wallets(user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
