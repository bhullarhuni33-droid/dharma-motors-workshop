create type public.user_role as enum ('customer', 'admin');
create type public.booking_status as enum ('pending', 'confirmed', 'arrived', 'completed', 'cancelled');
create type public.vehicle_type as enum ('car', 'truck', 'suv');
create type public.fuel_type as enum ('petrol', 'diesel');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null unique,
  role public.user_role not null default 'customer',
  referral_code text not null unique,
  referred_by uuid references public.profiles(id),
  points integer not null default 0 check (points >= 0),
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  model_name text not null,
  type public.vehicle_type not null,
  fuel public.fuel_type not null,
  created_at timestamptz not null default now()
);

create table public.time_slots (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  max_bookings integer not null default 1 check (max_bookings > 0),
  enabled boolean not null default true
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  slot_id uuid not null references public.time_slots(id) on delete restrict,
  appointment_date date not null,
  problem text not null,
  status public.booking_status not null default 'pending',
  created_at timestamptz not null default now()
);

create unique index one_booking_per_slot on public.bookings (slot_id, appointment_date, customer_id) where status not in ('cancelled');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique references public.bookings(id) on delete set null,
  customer_id uuid not null references public.profiles(id),
  vehicle_id uuid not null references public.vehicles(id),
  problem text not null,
  status public.booking_status not null default 'confirmed',
  created_at timestamptz not null default now()
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id),
  customer_id uuid not null references public.profiles(id),
  work_done text not null,
  spare_parts numeric(10,2) not null default 0,
  service_charge numeric(10,2) not null default 0,
  scanning_cost numeric(10,2) not null default 0,
  total numeric(10,2) generated always as (spare_parts + service_charge + scanning_cost) stored,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.referral_bonus_events (
  bill_id uuid primary key references public.bills(id) on delete cascade,
  referrer_id uuid not null references public.profiles(id),
  referred_customer_id uuid not null references public.profiles(id),
  referrer_points integer not null default 200,
  customer_points integer not null default 100,
  created_at timestamptz not null default now()
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  points_required integer not null check (points_required > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.battery_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  battery_type text not null,
  vehicle_model text not null,
  delivery_address text not null,
  phone text not null,
  notes text,
  status text not null default 'requested',
  created_at timestamptz not null default now()
);

create table public.walkin_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  vehicle_model text not null,
  vehicle_type public.vehicle_type not null,
  fuel public.fuel_type not null,
  notes text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.time_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.jobs enable row level security;
alter table public.bills enable row level security;
alter table public.rewards enable row level security;
alter table public.battery_requests enable row level security;
alter table public.walkin_requests enable row level security;
alter table public.referral_bonus_events enable row level security;

create policy "customers read own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "customers create own profile" on public.profiles for insert with check (id = auth.uid() and role = 'customer');
create policy "customers update own profile" on public.profiles for update using (id = auth.uid() or public.is_admin());
create policy "own vehicles" on public.vehicles for all using (customer_id = auth.uid() or public.is_admin()) with check (customer_id = auth.uid() or public.is_admin());
create policy "read enabled slots" on public.time_slots for select using (enabled or public.is_admin());
create policy "admin manage slots" on public.time_slots for all using (public.is_admin()) with check (public.is_admin());
create policy "own bookings" on public.bookings for select using (customer_id = auth.uid() or public.is_admin());
create policy "customers create bookings" on public.bookings for insert with check (customer_id = auth.uid());
create policy "admin manage bookings" on public.bookings for update using (public.is_admin()) with check (public.is_admin());
create policy "admin manage jobs" on public.jobs for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own jobs" on public.jobs for select using (customer_id = auth.uid());
create policy "own bills" on public.bills for select using (customer_id = auth.uid() or public.is_admin());
create policy "admin manage bills" on public.bills for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read rewards" on public.rewards for select using (enabled or public.is_admin());
create policy "admin manage rewards" on public.rewards for all using (public.is_admin()) with check (public.is_admin());
create policy "own battery requests" on public.battery_requests for all using (customer_id = auth.uid() or public.is_admin()) with check (customer_id = auth.uid() or public.is_admin());
create policy "admins manage walkin requests" on public.walkin_requests for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read referral events" on public.referral_bonus_events for select using (public.is_admin());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  referrer uuid;
begin
  select id into referrer
  from public.profiles
  where upper(referral_code) = upper(nullif(new.raw_user_meta_data->>'referral_code', ''))
  limit 1;

  insert into public.profiles (id, full_name, phone, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Customer'),
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    upper('DM-' || substr(replace(new.id::text, '-', ''), 1, 8))
  );
  update public.profiles
  set referred_by = (
    select id from public.profiles
    where upper(referral_code) = upper(nullif(new.raw_user_meta_data->>'referral_code', ''))
      and id <> new.id
    limit 1
  )
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.create_job_for_confirmed_booking()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') then
    insert into public.jobs (booking_id, customer_id, vehicle_id, problem, status)
    values (new.id, new.customer_id, new.vehicle_id, new.problem, 'confirmed')
    on conflict (booking_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_booking_confirmed after update of status on public.bookings
for each row execute procedure public.create_job_for_confirmed_booking();

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

    select referred_by into customer_referrer from public.profiles where id = new.customer_id;
    if new.total >= 500 and customer_referrer is not null then
      insert into public.referral_bonus_events (bill_id, referrer_id, referred_customer_id)
      values (new.id, customer_referrer, new.customer_id)
      on conflict (bill_id) do nothing;
      if found then
        update public.profiles set points = points + 200 where id = customer_referrer;
        update public.profiles set points = points + 100 where id = new.customer_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger on_bill_paid after update of status on public.bills
for each row execute procedure public.apply_paid_bill_points();

-- After creating the owner's account from the app, run this once:
-- update public.profiles set role = 'admin' where phone = '+917696707446';
