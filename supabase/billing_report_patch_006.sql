-- Yrityskohtainen laskutusraportti ja työntekijän laskutushinta.
-- Suorita Supabase SQL Editorissa ennen uuden sovellusversion käyttöönottoa.

alter table public.profiles
add column if not exists billing_rate numeric(10,2) not null default 0;

alter table public.profiles
drop constraint if exists profiles_billing_rate_nonnegative;

alter table public.profiles
add constraint profiles_billing_rate_nonnegative check (billing_rate >= 0);

comment on column public.profiles.billing_rate is
'Työntekijän arvonlisäveroton laskutushinta euroa tunnilta.';

-- Tuntiriville tallennetaan käytetty hinta, jotta myöhempi hinnanmuutos
-- ei muuta jo tehtyjen kuukausien laskutussummia.
alter table public.time_entries
add column if not exists billing_rate numeric(10,2);

alter table public.time_entries
drop constraint if exists time_entries_billing_rate_nonnegative;

alter table public.time_entries
add constraint time_entries_billing_rate_nonnegative
check (billing_rate is null or billing_rate >= 0);

create or replace function public.set_time_entry_billing_rate()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  employee_rate numeric(10,2);
begin
  if new.billing_rate is null then
    select nullif(p.billing_rate,0)
    into employee_rate
    from public.profiles p
    where p.id=new.employee_id;
    new.billing_rate=employee_rate;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entry_billing_rate_snapshot on public.time_entries;
create trigger time_entry_billing_rate_snapshot
before insert on public.time_entries
for each row execute function public.set_time_entry_billing_rate();

comment on column public.time_entries.billing_rate is
'Kirjauksen tekohetkellä käytetty arvonlisäveroton tuntihinta.';
