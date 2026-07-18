-- Palkkakuukauden sulkeminen ja tuntiarkiston lukitus.
-- Suorita kerran Supabasen SQL Editorissa version 20 käyttöönotossa.

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_month date not null check (period_month=date_trunc('month',period_month)::date),
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  reopened_at timestamptz,
  reopened_by uuid references public.profiles(id),
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,period_month)
);

alter table public.payroll_periods enable row level security;
drop policy if exists payroll_period_read on public.payroll_periods;
create policy payroll_period_read on public.payroll_periods for select to authenticated
using (organization_id=public.current_org_id());
drop policy if exists payroll_period_admin_all on public.payroll_periods;
create policy payroll_period_admin_all on public.payroll_periods for all to authenticated
using (organization_id=public.current_org_id() and public.current_app_role()='admin')
with check (organization_id=public.current_org_id() and public.current_app_role()='admin');

create or replace function public.is_payroll_month_open(p_date date) returns boolean
language sql stable security definer set search_path=public
as $$
  select not exists (
    select 1 from public.payroll_periods p
    where p.organization_id=public.current_org_id()
      and p.period_month=date_trunc('month',p_date)::date
      and p.status='closed'
  )
$$;

drop policy if exists entry_worker_insert on public.time_entries;
create policy entry_worker_insert on public.time_entries for insert to authenticated
with check (organization_id=public.current_org_id() and employee_id=auth.uid() and public.is_payroll_month_open(work_date));

drop policy if exists entry_worker_update on public.time_entries;
create policy entry_worker_update on public.time_entries for update to authenticated
using (organization_id=public.current_org_id() and employee_id=auth.uid() and status in ('draft','returned','submitted') and public.is_payroll_month_open(work_date))
with check (organization_id=public.current_org_id() and employee_id=auth.uid() and status in ('draft','returned','submitted') and public.is_payroll_month_open(work_date));

drop policy if exists entry_worker_delete on public.time_entries;
create policy entry_worker_delete on public.time_entries for delete to authenticated
using (organization_id=public.current_org_id() and employee_id=auth.uid() and status in ('draft','returned','submitted') and public.is_payroll_month_open(work_date));

drop policy if exists entry_manager_update on public.time_entries;
create policy entry_manager_update on public.time_entries for update to authenticated
using (organization_id=public.current_org_id() and public.is_payroll_month_open(work_date) and (public.current_app_role()='admin' or public.can_manage_worksite(worksite_id)))
with check (organization_id=public.current_org_id() and public.is_payroll_month_open(work_date) and (public.current_app_role()='admin' or public.can_manage_worksite(worksite_id)));

drop policy if exists entry_admin_delete on public.time_entries;
create policy entry_admin_delete on public.time_entries for delete to authenticated
using (organization_id=public.current_org_id() and public.current_app_role()='admin' and public.is_payroll_month_open(work_date));

drop policy if exists note_manager_all on public.day_notes;
create policy note_manager_all on public.day_notes for all to authenticated
using (
  organization_id=public.current_org_id()
  and public.is_payroll_month_open(work_date)
  and (public.current_app_role()='admin' or (worksite_id is not null and public.can_manage_worksite(worksite_id)))
)
with check (
  organization_id=public.current_org_id()
  and author_id=auth.uid()
  and public.is_payroll_month_open(work_date)
  and (public.current_app_role()='admin' or (worksite_id is not null and public.can_manage_worksite(worksite_id)))
);

create or replace function public.log_payroll_period_change() returns trigger
language plpgsql security definer set search_path=public
as $$
begin
  insert into public.audit_log(organization_id,actor_id,entity_type,entity_id,action,details)
  values (
    new.organization_id,auth.uid(),'payroll_period',new.id::text,
    case when new.status='closed' then 'closed' else 'reopened' end,
    jsonb_build_object('period_month',new.period_month,'reason',new.reopen_reason)
  );
  return new;
end;
$$;

drop trigger if exists payroll_period_audit on public.payroll_periods;
create trigger payroll_period_audit after insert or update of status on public.payroll_periods
for each row execute function public.log_payroll_period_change();
