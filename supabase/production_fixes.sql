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

-- The app's time-slot editor relies on the existing admin RLS policy.
-- No customer-facing Supabase errors are exposed by the frontend.
