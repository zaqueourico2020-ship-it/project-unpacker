-- Confirm all existing users immediately (no Gmail confirmation required)
update auth.users
set email_confirmed_at = now()
where email_confirmed_at is null;

-- Function to confirm a user's email on demand (used by server-side fallback)
create or replace function public.confirm_user_email(_email text)
returns void
language sql
security definer
set search_path = public
as $$
  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now())
  where lower(email) = lower(_email);
$$;

revoke all on function public.confirm_user_email(text) from public;
revoke all on function public.confirm_user_email(text) from anon;
revoke all on function public.confirm_user_email(text) from authenticated;
grant execute on function public.confirm_user_email(text) to service_role;

-- Trigger: auto-confirm every new user at creation time
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists auto_confirm_email_on_signup on auth.users;
create trigger auto_confirm_email_on_signup
  before insert on auth.users
  for each row
  execute function public.auto_confirm_new_user();
