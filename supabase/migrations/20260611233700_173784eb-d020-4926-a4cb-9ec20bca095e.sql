-- Create owner user if missing
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'grupogfredevarejistaoficial@gmail.com';
  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'grupogfredevarejistaoficial@gmail.com',
      crypt('GrupoGF@2026', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Grupo GF"}'::jsonb,
      false, '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'grupogfredevarejistaoficial@gmail.com'),
      'email', v_uid::text, now(), now(), now());
  ELSE
    UPDATE auth.users SET encrypted_password = crypt('GrupoGF@2026', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
    WHERE id = v_uid;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, full_name) VALUES (v_uid, 'Grupo GF') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
END $$;

-- Confirm all existing user emails so login works
UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE email_confirmed_at IS NULL;

-- Remove temporary helper
DROP FUNCTION IF EXISTS public.__tmp_exec_sql(text);