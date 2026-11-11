-- Applied with Supabase migration version 20261111122121 (CLI-created source, version aligned after apply).
-- Additive upgrade. Existing sites intentionally keep NULL (review pending).
-- No time entries, code names, memberships, auth or payroll data are rewritten.
alter table public.worksites add column allowed_littera_ids uuid[];
comment on column public.worksites.allowed_littera_ids is
  'NULL = legacy site awaiting review; {} = no new work allowed; array = explicit active cost codes.';

create function public.validate_worksite_litteras()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  item uuid;
begin
  -- Same key as entry validation; serialize code-list changes with new allocations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text, 20261111));
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Työmaan organisaatiota ei voi vaihtaa.' using errcode = '23514';
    end if;
    if new.allowed_littera_ids is not distinct from old.allowed_littera_ids then return new; end if;
  end if;
  if new.allowed_littera_ids is null then
    raise exception 'Valitse ja vahvista työmaalla käytettävät litterat.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and cardinality(new.allowed_littera_ids) = 0 then
    raise exception 'Valitse uudelle työmaalle vähintään yksi littera.' using errcode = '23514';
  end if;
  if cardinality(new.allowed_littera_ids) > 500
     or coalesce(array_ndims(new.allowed_littera_ids), 1) <> 1
     or exists (select 1 from unnest(new.allowed_littera_ids) x group by x having x is null or count(*) > 1) then
    raise exception 'Virheellinen työmaan litteravalinta.' using errcode = '23514';
  end if;
  foreach item in array new.allowed_littera_ids loop
    if not exists (select 1 from public.litteras l where l.id = item and l.organization_id = new.organization_id
      and (l.active or (tg_op = 'UPDATE' and item = any(old.allowed_littera_ids)))) then
      raise exception 'Litteran pitää olla aktiivinen ja kuulua samaan organisaatioon.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.validate_worksite_litteras() from public, anon, authenticated;
create trigger worksite_litteras_validate before insert or update of allowed_littera_ids, organization_id on public.worksites
for each row execute function public.validate_worksite_litteras();

create function public.validate_time_entry_littera()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  allowed uuid[];
begin
  -- Approval / note changes keep old allocations intact, even after a code is removed.
  if tg_op = 'UPDATE' then
    if row(new.organization_id,new.employee_id,new.worksite_id,new.littera_id,new.work_date,new.start_time,new.end_time)
       is not distinct from row(old.organization_id,old.employee_id,old.worksite_id,old.littera_id,old.work_date,old.start_time,old.end_time) then
      return new;
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(new.worksite_id::text, 20261111));
  select w.allowed_littera_ids into allowed from public.worksites w
    where w.id = new.worksite_id and w.organization_id = new.organization_id;
  if not found then
    raise exception 'Työmaa ei kuulu organisaatioon tai käyttöoikeus puuttuu.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.litteras l where l.id = new.littera_id and l.organization_id = new.organization_id and l.active) then
    raise exception 'Littera ei ole aktiivinen tässä organisaatiossa.' using errcode = '23514';
  end if;
  if allowed is not null and not (new.littera_id = any(allowed)) then
    raise exception 'Littera ei ole käytössä tällä työmaalla. Valitse työmaalle avattu littera.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_time_entry_littera() from public, anon, authenticated;
create trigger time_entry_littera_validate before insert or update on public.time_entries
for each row execute function public.validate_time_entry_littera();
notify pgrst, 'reload schema';
