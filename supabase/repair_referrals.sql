-- REFERRAL REPAIR AND VERIFICATION
-- Run this in Supabase SQL Editor after production_fixes.sql.
-- It repairs profiles created with a valid referral code and ensures future
-- sign-ups save the referrer automatically.

begin;

create or replace function public.validate_referral_code(code text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where upper(referral_code) = upper(trim(code))) $$;

grant execute on function public.validate_referral_code(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  entered_referral_code text;
  matched_referrer uuid;
begin
  entered_referral_code := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));

  if entered_referral_code <> '' then
    select id into matched_referrer
    from public.profiles
    where upper(referral_code) = entered_referral_code
      and id <> new.id
    limit 1;
    if matched_referrer is null then
      raise exception 'Invalid referral code';
    end if;
  end if;

  insert into public.profiles (id, full_name, phone, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Customer'),
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    upper('DM-' || substr(replace(new.id::text, '-', ''), 1, 8)),
    matched_referrer
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill existing customers whose sign-up metadata contains a valid code.
update public.profiles customer
set referred_by = referrer.id
from auth.users auth_user
join public.profiles referrer
  on upper(referrer.referral_code) = upper(trim(nullif(auth_user.raw_user_meta_data->>'referral_code', '')))
where customer.id = auth_user.id
  and customer.referred_by is null
  and referrer.id <> customer.id;

commit;

-- Verification: the entered code must appear under entered_referral_code and
-- a successful match must show a non-null referrer and referrer_name.
select
  customer.full_name as customer_name,
  customer.phone as customer_phone,
  auth_user.raw_user_meta_data->>'referral_code' as entered_referral_code,
  referrer.full_name as referrer_name,
  customer.referred_by is not null as referral_saved
from public.profiles customer
join auth.users auth_user on auth_user.id = customer.id
left join public.profiles referrer on referrer.id = customer.referred_by
where customer.role = 'customer'
order by customer.created_at desc;
