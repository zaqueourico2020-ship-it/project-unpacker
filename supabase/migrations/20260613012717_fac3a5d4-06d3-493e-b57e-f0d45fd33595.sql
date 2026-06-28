DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname='public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.relname);
  END LOOP;
END $$;

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.partner_products TO anon;
GRANT SELECT ON public.partners TO anon;
GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT ON public.store_state TO anon;
GRANT SELECT ON public.cashback_levels TO anon;
GRANT SELECT ON public.product_reviews TO anon;