
-- Enum de papéis
CREATE TYPE public.app_role AS ENUM ('admin', 'partner', 'customer');

-- Tabela de papéis
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Tabela de parceiros / lojas
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('PF','PJ')),
  nome text NOT NULL,
  documento text NOT NULL UNIQUE,
  email text NOT NULL,
  telefone text NOT NULL,
  endereco jsonb NOT NULL DEFAULT '{}'::jsonb,
  nome_loja text NOT NULL,
  slug text NOT NULL UNIQUE,
  descricao text,
  logo_url text,
  banner_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  verified boolean NOT NULL DEFAULT false,
  reliable_shipping boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view approved partners" ON public.partners
  FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners manage own row" ON public.partners
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage all partners" ON public.partners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER partners_set_updated_at
BEFORE UPDATE ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-ativação (usada pelo painel quando um usuário logado vira parceiro)
CREATE OR REPLACE FUNCTION public.activate_partner_self()
RETURNS TABLE (slug text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing record;
  new_slug text;
  base_slug text;
  meta jsonb;
  display_name text;
  user_email text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, slug, status INTO existing FROM public.partners WHERE user_id = uid;
  IF FOUND THEN
    IF existing.status <> 'approved' THEN
      UPDATE public.partners
         SET status = 'approved', approved_at = now(), rejection_reason = NULL
       WHERE id = existing.id;
    END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'partner')
      ON CONFLICT (user_id, role) DO NOTHING;
    RETURN QUERY SELECT existing.slug, false;
    RETURN;
  END IF;

  SELECT raw_user_meta_data, email INTO meta, user_email FROM auth.users WHERE id = uid;
  display_name := COALESCE(meta->>'full_name', meta->>'name', split_part(user_email, '@', 1), 'Parceiro GF');
  base_slug := regexp_replace(lower(unaccent(coalesce(display_name, 'loja'))), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN base_slug := 'loja'; END IF;
  new_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.partners WHERE slug = new_slug) LOOP
    new_slug := base_slug || '-' || floor(random()*99999)::int;
  END LOOP;

  INSERT INTO public.partners (user_id, tipo, nome, documento, email, telefone, endereco, nome_loja, slug, status, approved_at)
  VALUES (uid, 'PF', display_name, 'pending-' || replace(uid::text, '-', ''),
          coalesce(user_email, uid::text || '@grupogf.local'),
          coalesce(meta->>'phone', ''),
          '{}'::jsonb, 'Loja ' || display_name, new_slug, 'approved', now());

  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'partner')
    ON CONFLICT (user_id, role) DO NOTHING;

  RETURN QUERY SELECT new_slug, true;
END;
$$;
