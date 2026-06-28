
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.activate_partner_self() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_partner_self() TO authenticated, service_role;
