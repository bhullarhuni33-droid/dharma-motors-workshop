-- Run this once in the Supabase SQL Editor after the existing schema/migrations.
-- It protects booking capacity even when two customers submit at the same time.

insert into public.time_slots (label, max_bookings, enabled) values
  ('09:00 AM - 10:00 AM', 1, true),
  ('10:00 AM - 11:00 AM', 1, true),
  ('11:00 AM - 12:00 PM', 1, true),
  ('01:00 PM - 02:00 PM', 1, true),
  ('02:00 PM - 03:00 PM', 1, true)
on conflict (label) do nothing;

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
