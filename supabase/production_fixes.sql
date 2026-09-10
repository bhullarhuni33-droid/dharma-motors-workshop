-- Run this once in the Supabase SQL Editor after the existing schema/migrations.
-- It protects booking capacity even when two customers submit at the same time.

insert into public.time_slots (label, max_bookings, enabled) values
  ('09:00 AM - 10:00 AM', 1, true),
  ('10:00 AM - 11:00 AM', 1, true),
  ('11:00 AM - 12:00 PM', 1, true),
  ('01:00 PM - 02:00 PM', 1, true),
  ('02:00 PM - 03:00 PM', 1, true)
on conflict (label) do nothing;

-- Every confirmed booking must receive a linked job. This is what lets the
-- completed-job action open the bill for the correct customer.
create or replace function public.create_job_for_confirmed_booking()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    insert into public.jobs (booking_id, customer_id, vehicle_id, problem, status)
    values (new.id, new.customer_id, new.vehicle_id, new.problem, 'confirmed')
    on conflict (booking_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_booking_confirmed on public.bookings;
create trigger on_booking_confirmed
after update of status on public.bookings
for each row execute procedure public.create_job_for_confirmed_booking();

create or replace function public.sync_job_from_booking()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.jobs set status = new.status where booking_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_booking_status_changed on public.bookings;
create trigger on_booking_status_changed
after update of status on public.bookings
for each row execute procedure public.sync_job_from_booking();

-- Repair existing test/production bookings that reached a job status before
-- the trigger was installed.
insert into public.jobs (booking_id, customer_id, vehicle_id, problem, status)
select b.id, b.customer_id, b.vehicle_id, b.problem, b.status
from public.bookings b
where b.status in ('confirmed', 'arrived', 'completed')
  and not exists (select 1 from public.jobs j where j.booking_id = b.id);

create or replace function public.enforce_time_slot_capacity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  allowed_bookings integer;
  current_bookings integer;
begin
  -- Lock this slot until the booking transaction completes, preventing race conditions.
  select max_bookings into allowed_bookings
  from public.time_slots
  where id = new.slot_id and enabled = true
  for update;

  if allowed_bookings is null then
    raise exception 'This appointment slot is not available';
  end if;

  select count(*) into current_bookings
  from public.bookings
  where slot_id = new.slot_id
    and appointment_date = new.appointment_date
    and status <> 'cancelled';

  if current_bookings >= allowed_bookings then
    raise exception 'This appointment slot is fully booked';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_time_slot_capacity_before_booking on public.bookings;
create trigger enforce_time_slot_capacity_before_booking
before insert on public.bookings
for each row execute procedure public.enforce_time_slot_capacity();

-- Referral rewards: only the first qualifying paid bill of a referred customer
-- receives the +100 / +200 bonus. Normal service points still apply to all bills.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'points',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "customers read own notifications" on public.notifications;
create policy "customers read own notifications" on public.notifications
for select using (customer_id = auth.uid() or public.is_admin());
drop policy if exists "customers update own notifications" on public.notifications;
create policy "customers update own notifications" on public.notifications
for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());

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

create or replace function public.apply_paid_bill_points()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  customer_referrer uuid;
  service_points integer;
  referral_already_rewarded boolean;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    service_points := floor(new.total / 100)::integer * 10;
    update public.profiles set points = points + service_points where id = new.customer_id;
    insert into public.notifications (customer_id, title, message, type)
    values (new.customer_id, 'Service points added', format('Your paid bill earned %s points.', service_points), 'service_points');

    select referred_by into customer_referrer from public.profiles where id = new.customer_id for update;
    select exists(
      select 1 from public.referral_bonus_events
      where referred_customer_id = new.customer_id
    ) into referral_already_rewarded;

    if new.total >= 500 and customer_referrer is not null and not referral_already_rewarded then
      insert into public.referral_bonus_events (bill_id, referrer_id, referred_customer_id)
      values (new.id, customer_referrer, new.customer_id);
      update public.profiles set points = points + 200 where id = customer_referrer;
      update public.profiles set points = points + 100 where id = new.customer_id;
      insert into public.notifications (customer_id, title, message, type) values
        (new.customer_id, 'Referral bonus unlocked', 'Your first ₹500+ paid service earned an extra 100 referral points.', 'referral_bonus'),
        (customer_referrer, 'Referral reward unlocked', 'Your referred customer completed their first ₹500+ paid service. You earned 200 points.', 'referral_bonus');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_bill_paid on public.bills;
create trigger on_bill_paid after update of status on public.bills
for each row execute procedure public.apply_paid_bill_points();

-- Ensure referral codes entered at sign-up create the relationship, including
-- customers created before this trigger was installed.
create or replace function public.normalize_referral_code(code text)
returns text language sql immutable set search_path = public
as $$ select nullif(regexp_replace(upper(coalesce(code, '')), '[^A-Z0-9]', '', 'g'), '') $$;

create or replace function public.validate_referral_code(code text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where public.normalize_referral_code(referral_code) = public.normalize_referral_code(code)) $$;

grant execute on function public.validate_referral_code(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  entered_referral_code text;
  matched_referrer uuid;
begin
  entered_referral_code := public.normalize_referral_code(jsonb_extract_path_text(new.raw_user_meta_data, 'referral_code'));
  if entered_referral_code <> '' then
    select id into matched_referrer
    from public.profiles
    where public.normalize_referral_code(referral_code) = entered_referral_code and id <> new.id
    limit 1;
    if matched_referrer is null then
      raise exception 'Invalid referral code';
    end if;
  end if;
  insert into public.profiles (id, full_name, phone, referral_code, referred_by)
  values (
    new.id,
    coalesce(jsonb_extract_path_text(new.raw_user_meta_data, 'full_name'), 'Customer'),
    coalesce(jsonb_extract_path_text(new.raw_user_meta_data, 'phone'), new.phone),
    upper('DM-' || substr(replace(new.id::text, '-', ''), 1, 8)),
    matched_referrer
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

update public.profiles customer
set referred_by = referrer.id
from auth.users auth_user
join public.profiles referrer
  on upper(referrer.referral_code) = upper(nullif(jsonb_extract_path_text(auth_user.raw_user_meta_data, 'referral_code'), ''))
where customer.id = auth_user.id
  and customer.referred_by is null
  and referrer.id <> customer.id;
