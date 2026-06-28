-- Followers system: customers follow partner stores
-- Apply this in your Supabase project SQL editor.

create table if not exists public.followers (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, seller_id)
);

create index if not exists followers_seller_idx on public.followers(seller_id);
create index if not exists followers_follower_idx on public.followers(follower_id);

grant select, insert, delete on public.followers to authenticated;
grant select on public.followers to anon;
grant all on public.followers to service_role;

alter table public.followers enable row level security;

drop policy if exists "followers_select_all" on public.followers;
create policy "followers_select_all"
  on public.followers for select
  to anon, authenticated
  using (true);

drop policy if exists "followers_insert_self" on public.followers;
create policy "followers_insert_self"
  on public.followers for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "followers_delete_self" on public.followers;
create policy "followers_delete_self"
  on public.followers for delete
  to authenticated
  using (follower_id = auth.uid());
