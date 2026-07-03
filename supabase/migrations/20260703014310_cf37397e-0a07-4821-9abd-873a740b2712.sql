
-- Referral program: codes, referrals, rewards, and reward automation

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT SELECT ON public.referral_codes TO anon;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read referral codes" ON public.referral_codes FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'signed_up',
  first_order_id UUID,
  first_order_total NUMERIC(12,2),
  first_order_at TIMESTAMPTZ,
  reward_amount NUMERIC(12,2) NOT NULL DEFAULT 5.00,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referred_id)
);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own referrals" ON public.referrals FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_status_idx ON public.referrals(status);

-- Ensure wallets table has needed columns (safe if missing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wallets' AND column_name='blocked_balance') THEN
    ALTER TABLE public.wallets ADD COLUMN blocked_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Helper: generate unique code
CREATE OR REPLACE FUNCTION public.gen_referral_code(_user_id UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_code TEXT;
BEGIN
  LOOP
    v_code := upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_code);
  END LOOP;
  RETURN v_code;
END $$;

-- Trigger on new user: create wallet, profile, referral code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_code TEXT; v_ref_code TEXT;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, user_type, cnpj)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.raw_user_meta_data->>'phone',''), COALESCE(NEW.raw_user_meta_data->>'user_type','pessoa_fisica'), NEW.raw_user_meta_data->>'cnpj')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  v_code := public.gen_referral_code(NEW.id);
  INSERT INTO public.referral_codes (user_id, code) VALUES (NEW.id, v_code) ON CONFLICT (user_id) DO NOTHING;

  -- Attach referral if code was provided at signup
  v_ref_code := upper(NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'),''));
  IF v_ref_code IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code, status)
    SELECT rc.user_id, NEW.id, rc.code, 'signed_up'
    FROM public.referral_codes rc
    WHERE rc.code = v_ref_code AND rc.user_id <> NEW.id
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- Backfill: codes and wallets for existing users
INSERT INTO public.referral_codes (user_id, code)
SELECT u.id, public.gen_referral_code(u.id)
FROM auth.users u
LEFT JOIN public.referral_codes rc ON rc.user_id = u.id
WHERE rc.id IS NULL;

-- Apply referral code (post-signup, before first order)
CREATE OR REPLACE FUNCTION public.apply_referral_code(_code TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid UUID := auth.uid(); v_ref UUID; v_c TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  v_c := upper(trim(_code));
  SELECT user_id INTO v_ref FROM public.referral_codes WHERE code = v_c;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF v_ref = v_uid THEN RAISE EXCEPTION 'self_referral'; END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE user_id = v_uid AND status IN ('paid','delivered','completed','shipped')) THEN
    RAISE EXCEPTION 'already_ordered';
  END IF;
  INSERT INTO public.referrals (referrer_id, referred_id, code, status)
  VALUES (v_ref, v_uid, v_c, 'signed_up')
  ON CONFLICT (referred_id) DO NOTHING;
  RETURN 'ok';
END $$;

-- Process reward: called when an order becomes eligible
CREATE OR REPLACE FUNCTION public.process_referral_reward(_order_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.referrals; o RECORD; v_wallet public.wallets;
BEGIN
  SELECT id, user_id, total, status INTO o FROM public.orders WHERE id = _order_id;
  IF o.id IS NULL THEN RETURN; END IF;
  IF o.status NOT IN ('delivered','completed','paid') THEN RETURN; END IF;
  IF COALESCE(o.total,0) < 50 THEN RETURN; END IF;

  SELECT * INTO r FROM public.referrals WHERE referred_id = o.user_id;
  IF r.id IS NULL OR r.rewarded_at IS NOT NULL THEN RETURN; END IF;

  -- Must be the first eligible order
  IF EXISTS (SELECT 1 FROM public.orders WHERE user_id = o.user_id AND id <> o.id AND status IN ('delivered','completed','paid') AND created_at < (SELECT created_at FROM public.orders WHERE id = o.id)) THEN
    UPDATE public.referrals SET first_order_id=o.id, first_order_total=o.total, first_order_at=now(), status='not_first', updated_at=now() WHERE id=r.id;
    RETURN;
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = r.referrer_id FOR UPDATE;
  IF v_wallet.id IS NULL THEN
    INSERT INTO public.wallets(user_id) VALUES (r.referrer_id) RETURNING * INTO v_wallet;
  END IF;

  UPDATE public.wallets SET available_balance = available_balance + r.reward_amount, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions(wallet_id, user_id, type, status, amount, description, reference_id)
  VALUES (v_wallet.id, r.referrer_id, 'referral_bonus', 'completed', r.reward_amount, 'Bônus por indicação', r.id);

  UPDATE public.referrals SET status='rewarded', rewarded_at=now(), first_order_id=o.id, first_order_total=o.total, first_order_at=now(), updated_at=now()
  WHERE id = r.id;

  INSERT INTO public.notifications(user_id, kind, title, body, link)
  VALUES (r.referrer_id, 'referral_reward', 'Você ganhou R$ ' || r.reward_amount || '!', 'Sua indicação foi confirmada e o bônus foi creditado na sua Carteira GF.', '/indique-e-ganhe')
  ON CONFLICT DO NOTHING;
END $$;

-- Trigger on orders status update
CREATE OR REPLACE FUNCTION public.on_order_status_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('delivered','completed','paid') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.process_referral_reward(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_referral_reward ON public.orders;
CREATE TRIGGER trg_order_referral_reward
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.on_order_status_change();

-- updated_at trigger on referrals
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_referrals_touch ON public.referrals;
CREATE TRIGGER trg_referrals_touch BEFORE UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
