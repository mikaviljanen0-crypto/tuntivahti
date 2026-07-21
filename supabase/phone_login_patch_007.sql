-- Tuntivahti: kirjautuminen sähköpostilla tai puhelinnumerolla.
-- Turvallinen ajaa useamman kerran Supabasen SQL Editorissa.

alter table public.profiles
  add column if not exists phone text;

drop index if exists public.profiles_organization_phone_unique;

create unique index if not exists profiles_phone_unique
  on public.profiles (phone)
  where phone is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_phone_e164_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_phone_e164_check
      check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
  end if;
end
$$;

comment on column public.profiles.phone is
  'Kirjautumisnumero kansainvälisessä E.164-muodossa, esimerkiksi +358401234567.';
