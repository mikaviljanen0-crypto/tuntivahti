-- Tuntivahti: työnjohtajan litterakorjaus ja hyväksytyn päivän palautus.
-- Palkkakauden lukitus pysyy voimassa nykyisten RLS-sääntöjen kautta.

create or replace function public.log_time_entry_correction() returns trigger
language plpgsql security definer set search_path=public
as $$
declare
  old_code text;
  new_code text;
begin
  if old.littera_id is distinct from new.littera_id then
    select code into old_code from public.litteras where id=old.littera_id;
    select code into new_code from public.litteras where id=new.littera_id;
    insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,details)
    values (
      new.organization_id,
      auth.uid(),
      'time_entry',
      new.id::text,
      'littera_changed',
      jsonb_build_object(
        'work_date',new.work_date,
        'old_littera_id',old.littera_id,
        'old_littera_code',old_code,
        'new_littera_id',new.littera_id,
        'new_littera_code',new_code
      )
    );
  end if;

  if old.status is distinct from new.status then
    insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,details)
    values (
      new.organization_id,
      auth.uid(),
      'time_entry',
      new.id::text,
      'approval_status_changed',
      jsonb_build_object(
        'work_date',new.work_date,
        'old_status',old.status,
        'new_status',new.status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists time_entry_correction_audit on public.time_entries;
create trigger time_entry_correction_audit
after update of littera_id,status on public.time_entries
for each row execute function public.log_time_entry_correction();
