ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';