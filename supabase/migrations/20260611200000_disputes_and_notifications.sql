-- ============================================================
-- Disputes + Notification triggers + minor product/store extras
-- ============================================================

-- ---------- ENUMs ----------
do $$ begin
  create type public.dispute_status as enum ('aberta','em_analise','aguardando_resposta','resolvida','encerrada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_reason as enum ('nao_recebido','diferente_anunciado','com_defeito','reembolso','outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispute_resolution as enum ('liberar_vendedor','reembolso_total','reembolso_parcial');
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  partner_order_id uuid references public.partner_orders(id) on delete set null,
  partner_id uuid references public.partners(id) on delete set null,
  customer_id uuid references auth.users(id) on delete set null,
  reason public.dispute_reason not null,
  description text not null,
  status public.dispute_status not null default 'aberta',
  resolution public.dispute_resolution,
  refund_amount numeric(14,2),
  seller_deadline timestamptz not null default (now() + interval '72 hours'),
  balance_block_id uuid references public.balance_blocks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

create index if not exists disputes_customer_idx on public.disputes(customer_id);
create index if not exists disputes_partner_idx on public.disputes(partner_id);
create index if not exists disputes_status_idx on public.disputes(status);

create table if not exists public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  author_id uuid not null,
  author_role text not null check (author_role in ('customer','seller','admin')),
  message text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists dispute_messages_dispute_idx on public.dispute_messages(dispute_id);

-- ---------- Grants ----------
grant select, insert, update on public.disputes to authenticated;
grant all on public.disputes to service_role;
grant select, insert on public.dispute_messages to authenticated;
grant all on public.dispute_messages to service_role;

-- ---------- RLS ----------
alter table public.disputes enable row level security;
alter table public.dispute_messages enable row level security;

drop policy if exists "disputes_customer_select" on public.disputes;
create policy "disputes_customer_select" on public.disputes
  for select to authenticated
  using (customer_id = auth.uid()
         or partner_id in (select id from public.partners where user_id = auth.uid())
         or public.has_role(auth.uid(), 'admin'));

drop policy if exists "disputes_customer_insert" on public.disputes;
create policy "disputes_customer_insert" on public.disputes
  for insert to authenticated
  with check (customer_id = auth.uid());

drop policy if exists "disputes_update" on public.disputes;
create policy "disputes_update" on public.disputes
  for update to authenticated
  using (partner_id in (select id from public.partners where user_id = auth.uid())
         or public.has_role(auth.uid(), 'admin'));

drop policy if exists "dispute_messages_select" on public.dispute_messages;
create policy "dispute_messages_select" on public.dispute_messages
  for select to authenticated
  using (dispute_id in (
    select id from public.disputes
    where customer_id = auth.uid()
       or partner_id in (select id from public.partners where user_id = auth.uid())
       or public.has_role(auth.uid(),'admin')
  ));

drop policy if exists "dispute_messages_insert" on public.dispute_messages;
create policy "dispute_messages_insert" on public.dispute_messages
  for insert to authenticated
  with check (author_id = auth.uid() and dispute_id in (
    select id from public.disputes
    where customer_id = auth.uid()
       or partner_id in (select id from public.partners where user_id = auth.uid())
       or public.has_role(auth.uid(),'admin')
  ));

-- ---------- Storage bucket for attachments ----------
insert into storage.buckets (id, name, public)
values ('dispute-attachments','dispute-attachments', false)
on conflict (id) do nothing;

drop policy if exists "dispute_attachments_select" on storage.objects;
create policy "dispute_attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'dispute-attachments');

drop policy if exists "dispute_attachments_insert" on storage.objects;
create policy "dispute_attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dispute-attachments');

-- ---------- Notification helper ----------
create or replace function public.notify_user(
  _user_id uuid, _kind text, _title text, _body text, _link text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  insert into public.notifications(user_id, kind, title, body, link)
  values (_user_id, _kind, _title, _body, _link) returning id into nid;
  return nid;
end $$;

-- ---------- Trigger: new order → notify partner(s) ----------
create or replace function public.tg_notify_new_partner_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare seller_user uuid;
begin
  select user_id into seller_user from public.partners where id = NEW.partner_id;
  if seller_user is not null then
    perform public.notify_user(
      seller_user, 'order_new', '🔔 Nova venda realizada',
      'Pedido #' || substr(NEW.id::text,1,8) || ' — Valor R$ ' || to_char(NEW.total,'FM999990.00'),
      '/parceiro/pedidos'
    );
  end if;
  return NEW;
end $$;

drop trigger if exists trg_notify_new_partner_order on public.partner_orders;
create trigger trg_notify_new_partner_order
after insert on public.partner_orders
for each row execute function public.tg_notify_new_partner_order();

-- ---------- Trigger: order shipped → notify customer ----------
create or replace function public.tg_notify_order_shipped()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status = 'shipped' and (OLD.status is distinct from 'shipped') and NEW.customer_user_id is not null then
    perform public.notify_user(
      NEW.customer_user_id, 'order_shipped', '📦 Seu pedido foi enviado',
      coalesce('Código de rastreio: ' || NEW.tracking_code, 'Seu pedido foi enviado pelo vendedor.'),
      '/perfil/pedidos'
    );
  end if;
  return NEW;
end $$;

drop trigger if exists trg_notify_order_shipped on public.partner_orders;
create trigger trg_notify_order_shipped
after update on public.partner_orders
for each row execute function public.tg_notify_order_shipped();

-- ---------- Trigger: balance released → notify seller ----------
create or replace function public.tg_notify_block_released()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status = 'released' and (OLD.status is distinct from 'released') then
    perform public.notify_user(
      NEW.user_id, 'balance_released', '✅ Saldo disponível para saque',
      'Valor liberado: R$ ' || to_char(NEW.amount,'FM999990.00'),
      '/carteira'
    );
  end if;
  return NEW;
end $$;

drop trigger if exists trg_notify_block_released on public.balance_blocks;
create trigger trg_notify_block_released
after update on public.balance_blocks
for each row execute function public.tg_notify_block_released();

-- ---------- Trigger: dispute opened → bloqueia saldo + notifica vendedor ----------
create or replace function public.tg_dispute_opened()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  seller_user uuid;
  v_net numeric(14,2);
  v_block uuid;
begin
  select user_id into seller_user from public.partners where id = NEW.partner_id;

  -- bloqueia o valor líquido do vendedor referente ao pedido
  if NEW.partner_order_id is not null then
    select coalesce(partner_net, 0) into v_net from public.partner_orders where id = NEW.partner_order_id;
    if seller_user is not null and v_net > 0 then
      insert into public.balance_blocks(user_id, amount, reason, related_order_id, status, notes)
      values (seller_user, v_net, 'dispute_hold', NEW.order_id, 'active',
              'Bloqueio automático por disputa ' || NEW.id::text)
      returning id into v_block;
      update public.disputes set balance_block_id = v_block where id = NEW.id;
    end if;
  end if;

  if seller_user is not null then
    perform public.notify_user(
      seller_user, 'dispute_opened', '⚠️ Nova disputa aberta',
      'Pedido #' || substr(coalesce(NEW.order_id::text, NEW.id::text),1,8) ||
      ' — Prazo para resposta: 72 horas',
      '/parceiro/disputas'
    );
  end if;

  return NEW;
end $$;

drop trigger if exists trg_dispute_opened on public.disputes;
create trigger trg_dispute_opened
after insert on public.disputes
for each row execute function public.tg_dispute_opened();

-- ---------- RPC: resolve dispute ----------
create or replace function public.resolve_dispute(
  _dispute_id uuid,
  _resolution public.dispute_resolution,
  _refund_amount numeric default null,
  _admin_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  d public.disputes;
  seller_user uuid;
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'forbidden';
  end if;

  select * into d from public.disputes where id = _dispute_id for update;
  if not found then raise exception 'dispute not found'; end if;

  select user_id into seller_user from public.partners where id = d.partner_id;

  if _resolution = 'liberar_vendedor' then
    -- libera o bloqueio (trigger notifica vendedor)
    update public.balance_blocks set status='released', released_at=now(), released_by=auth.uid()
      where id = d.balance_block_id and status='active';
    if d.customer_id is not null then
      perform public.notify_user(d.customer_id,'dispute_resolved','Disputa encerrada',
        'O vendedor venceu sua disputa. Caso discorde, entre em contato com o suporte.','/perfil');
    end if;
  elsif _resolution = 'reembolso_total' then
    -- bloqueio permanece consumido (não retorna ao vendedor); registra audit
    update public.balance_blocks set status='released', released_at=now(), released_by=auth.uid(),
      notes = coalesce(notes,'') || ' | consumido por reembolso total'
      where id = d.balance_block_id;
    insert into public.financial_audit_logs(event, actor, order_id, partner_id, amount, details)
    values ('dispute_refund_full', auth.uid(), d.order_id, d.partner_id,
            coalesce(d.refund_amount,_refund_amount,0), jsonb_build_object('dispute_id',d.id));
    if d.customer_id is not null then
      perform public.notify_user(d.customer_id,'dispute_resolved','✅ Reembolso aprovado',
        'Sua disputa foi resolvida a seu favor. O reembolso total será processado.','/perfil');
    end if;
    if seller_user is not null then
      perform public.notify_user(seller_user,'dispute_lost','Disputa decidida para o cliente',
        'O valor foi reembolsado integralmente ao cliente.','/parceiro/disputas');
    end if;
  elsif _resolution = 'reembolso_parcial' then
    update public.balance_blocks set status='released', released_at=now(), released_by=auth.uid(),
      notes = coalesce(notes,'') || ' | reembolso parcial R$ ' || coalesce(_refund_amount,0)::text
      where id = d.balance_block_id;
    insert into public.financial_audit_logs(event, actor, order_id, partner_id, amount, details)
    values ('dispute_refund_partial', auth.uid(), d.order_id, d.partner_id,
            coalesce(_refund_amount,0), jsonb_build_object('dispute_id',d.id));
    if d.customer_id is not null then
      perform public.notify_user(d.customer_id,'dispute_resolved','Reembolso parcial aprovado',
        'Valor: R$ ' || to_char(coalesce(_refund_amount,0),'FM999990.00'),'/perfil');
    end if;
    if seller_user is not null then
      perform public.notify_user(seller_user,'dispute_partial','Disputa: reembolso parcial',
        'Valor reembolsado ao cliente: R$ ' || to_char(coalesce(_refund_amount,0),'FM999990.00'),'/parceiro/disputas');
    end if;
  end if;

  update public.disputes
    set status = 'resolvida', resolution = _resolution,
        refund_amount = coalesce(_refund_amount, refund_amount),
        resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
    where id = _dispute_id;
end $$;

grant execute on function public.resolve_dispute(uuid, public.dispute_resolution, numeric, text) to authenticated;

-- ---------- Partner store extras (banners múltiplos + capa + checkout direto) ----------
alter table public.partners
  add column if not exists cover_url text,
  add column if not exists store_banners jsonb not null default '[]'::jsonb,
  add column if not exists direct_checkout_enabled boolean not null default true;

-- ---------- Partner products: campos extras ----------
alter table public.partner_products
  add column if not exists discount_price numeric(14,2),
  add column if not exists brand text,
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists notes text;

-- ---------- Product variants ----------
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  partner_product_id uuid not null references public.partner_products(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(14,2) not null default 0,
  discount_price numeric(14,2),
  stock integer not null default 0,
  image_url text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(partner_product_id);

grant select on public.product_variants to anon;
grant select, insert, update, delete on public.product_variants to authenticated;
grant all on public.product_variants to service_role;
alter table public.product_variants enable row level security;

drop policy if exists "variants_public_read" on public.product_variants;
create policy "variants_public_read" on public.product_variants for select using (true);

drop policy if exists "variants_owner_write" on public.product_variants;
create policy "variants_owner_write" on public.product_variants
  for all to authenticated
  using (partner_product_id in (
    select id from public.partner_products
    where partner_id in (select id from public.partners where user_id = auth.uid())
  ) or public.has_role(auth.uid(),'admin'))
  with check (partner_product_id in (
    select id from public.partner_products
    where partner_id in (select id from public.partners where user_id = auth.uid())
  ) or public.has_role(auth.uid(),'admin'));
