-- TEST DATA RESET
-- Run in Supabase SQL Editor to start a fresh test cycle.
-- Keeps: admin account(s), time slots, schema, and workshop settings.
-- Removes: customers, their login accounts, vehicles, bookings, jobs, bills,
-- rewards, claims, referrals, battery requests, and walk-in requests.

begin;

-- Remove referral links first so customer profile deletion is never blocked.
update public.profiles set referred_by = null where referred_by is not null;

delete from public.reward_claims;
delete from public.referral_bonus_events;
delete from public.bills;
delete from public.jobs;
delete from public.bookings;
delete from public.battery_requests;
delete from public.walkin_requests;
delete from public.vehicles;
delete from public.rewards;

-- Delete customer Auth users. Their profile rows are deleted automatically.
-- Admin account(s) remain available to sign into the workshop dashboard.
-- Important: any referral code belonging to a deleted test customer also
-- stops existing. After a reset, create a new referrer account and copy its
-- newly generated code before creating the referred test customer.
delete from auth.users
where id in (select id from public.profiles where role = 'customer');

update public.workshop_settings
set appointments_open = true, updated_at = now()
where id = true;

commit;

-- Check that only admin profiles remain and no live test records remain.
select
  (select count(*) from public.profiles where role = 'customer') as customers,
  (select count(*) from public.bookings) as bookings,
  (select count(*) from public.jobs) as jobs,
  (select count(*) from public.bills) as bills,
  (select count(*) from public.time_slots where enabled) as enabled_time_slots;
