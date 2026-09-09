-- Run this once in Supabase for an existing Dharma Motors database.
-- It is safe to run after the original schema has already been applied.

create table if not exists public.referral_bonus_events (
  bill_id uuid primary key references public.bills(id) on delete cascade,
  referrer_id uuid not null references public.profiles(id),
  referred_customer_id uuid not null references public.profiles(id),
  referrer_points integer not null default 200,
  customer_points integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.referral_bonus_events enable row level security;
drop policy if exists "admins read referral events" on public.referral_bonus_events;
create policy "admins read referral events" on public.referral_bonus_events for select using (public.is_admin());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Customer'),
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    upper('DM-' || substr(replace(new.id::text, '-', ''), 1, 8)),
    (
      select id from public.profiles
      where upper(referral_code) = upper(nullif(new.raw_user_meta_data->>'referral_code', ''))
        and id <> new.id
      limit 1
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.apply_paid_bill_points()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  customer_referrer uuid;
  service_points integer;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    service_points := floor(new.total / 100)::integer * 10;
    update public.profiles set points = points + service_points where id = new.customer_id;
    select referred_by into customer_referrer from public.profiles where id = new.customer_id for update;
    if new.total >= 500 and customer_referrer is not null and not exists (
      select 1 from public.referral_bonus_events where referred_customer_id = new.customer_id
    ) then
      insert into public.referral_bonus_events (bill_id, referrer_id, referred_customer_id)
      values (new.id, customer_referrer, new.customer_id);
      if found then
        update public.profiles set points = points + 200 where id = customer_referrer;
        update public.profiles set points = points + 100 where id = new.customer_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_bill_paid on public.bills;
create trigger on_bill_paid after update of status on public.bills
for each row execute procedure public.apply_paid_bill_points();
