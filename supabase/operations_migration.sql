-- Run this once for an existing Dharma Motors Supabase database.
-- It fixes completed-job billing, appointment availability, and reward claim tracking.

create table if not exists public.workshop_settings (
  id boolean primary key default true check (id = true),
  appointments_open boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.workshop_settings (id) values (true) on conflict (id) do nothing;
alter table public.workshop_settings enable row level security;
drop policy if exists "customers read workshop status" on public.workshop_settings;
create policy "customers read workshop status" on public.workshop_settings for select using (true);
drop policy if exists "admins manage workshop status" on public.workshop_settings;
create policy "admins manage workshop status" on public.workshop_settings for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.appointments_are_open()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select appointments_open from public.workshop_settings where id = true), true) $$;
drop policy if exists "customers create bookings" on public.bookings;
drop policy if exists "customers book only when open" on public.bookings;
create policy "customers book only when open" on public.bookings for insert with check (customer_id = auth.uid() and public.appointments_are_open());

create or replace function public.sync_job_from_booking()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.jobs set status = new.status where booking_id = new.id;
  return new;
end;
$$;
drop trigger if exists on_booking_status_changed on public.bookings;
create trigger on_booking_status_changed after update of status on public.bookings for each row execute procedure public.sync_job_from_booking();

update public.jobs j
set status = b.status
from public.bookings b
where j.booking_id = b.id;

create table if not exists public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards(id),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  points_spent integer not null,
  status text not null default 'claimed' check (status in ('claimed', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.reward_claims enable row level security;
drop policy if exists "customers read own reward claims" on public.reward_claims;
create policy "customers read own reward claims" on public.reward_claims for select using (customer_id = auth.uid() or public.is_admin());
drop policy if exists "customers claim rewards" on public.reward_claims;
create policy "customers claim rewards" on public.reward_claims for insert with check (customer_id = auth.uid());
drop policy if exists "admins manage reward claims" on public.reward_claims;
create policy "admins manage reward claims" on public.reward_claims for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.process_reward_claim()
returns trigger language plpgsql security definer set search_path = public
as $$
declare required_points integer; current_points integer;
begin
  select points_required into required_points from public.rewards where id = new.reward_id and enabled = true;
  select points into current_points from public.profiles where id = new.customer_id;
  if required_points is null then raise exception 'Reward is not available'; end if;
  if current_points < required_points then raise exception 'Not enough reward points'; end if;
  new.points_spent := required_points;
  update public.profiles set points = points - required_points where id = new.customer_id;
  return new;
end;
$$;
drop trigger if exists on_reward_claim on public.reward_claims;
create trigger on_reward_claim before insert on public.reward_claims for each row execute procedure public.process_reward_claim();
