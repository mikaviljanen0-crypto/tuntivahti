-- Yhdistelmäroolit ja työmaakohtaiset kommentit.
-- Hyväksyntä on muodollinen: raportointi näyttää kaikki kirjaukset tilasta riippumatta.

alter table public.profiles add column if not exists is_foreman boolean not null default false;
update public.profiles set is_foreman=true where role='foreman';

alter table public.day_notes add column if not exists worksite_id uuid references public.worksites(id) on delete cascade;
alter table public.day_notes drop constraint if exists day_notes_employee_id_work_date_key;
create unique index if not exists day_notes_employee_date_worksite_unique
on public.day_notes(employee_id,work_date,worksite_id);

drop policy if exists entry_worker_update on public.time_entries;
create policy entry_worker_update on public.time_entries for update to authenticated
using (employee_id=auth.uid() and status in ('draft','returned'))
with check (employee_id=auth.uid() and status in ('draft','returned','submitted'));

drop policy if exists note_manager_all on public.day_notes;
drop policy if exists note_read on public.day_notes;
create policy note_read on public.day_notes for select to authenticated
using (
  organization_id=public.current_org_id()
  and (employee_id=auth.uid() or public.current_app_role()='admin' or (worksite_id is not null and public.can_manage_worksite(worksite_id)))
);
create policy note_manager_all on public.day_notes for all to authenticated
using (
  organization_id=public.current_org_id()
  and (public.current_app_role()='admin' or (worksite_id is not null and public.can_manage_worksite(worksite_id)))
)
with check (
  organization_id=public.current_org_id()
  and author_id=auth.uid()
  and (public.current_app_role()='admin' or (worksite_id is not null and public.can_manage_worksite(worksite_id)))
);
