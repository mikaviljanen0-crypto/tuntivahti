-- Tuntivahti + Työmaavahti: yhteinen tuotantotietokanta
-- Suorita Supabase-projektin SQL Editorissa yhtenä kokonaisuutena.

create extension if not exists pgcrypto;

create type public.app_role as enum ('worker','foreman','admin');
create type public.worksite_status as enum ('active','closed');
create type public.approval_status as enum ('draft','submitted','approved','returned');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_id text,
  created_at timestamptz not null default now()
);

create table public.employers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  business_id text,
  active boolean not null default true,
  unique (organization_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employer_id uuid references public.employers(id),
  full_name text not null,
  phone text,
  language text not null default 'fi' check (language in ('fi','sq','en','uk')),
  billing_rate numeric(10,2) not null default 0 check (billing_rate >= 0),
  role public.app_role not null default 'worker',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.worksites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  name text not null,
  status public.worksite_status not null default 'active',
  foreman_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

create table public.worksite_members (
  worksite_id uuid not null references public.worksites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (worksite_id, user_id)
);

create table public.litteras (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  name_sq text,
  name_en text,
  name_uk text,
  active boolean not null default true,
  unique (organization_id, code)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  worksite_id uuid not null references public.worksites(id),
  littera_id uuid not null references public.litteras(id),
  work_date date not null,
  start_time time not null,
  end_time time not null,
  billing_rate numeric(10,2) check (billing_rate is null or billing_rate >= 0),
  note text,
  status public.approval_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint end_after_start check (end_time > start_time)
);

create table public.day_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  work_date date not null,
  author_id uuid not null references public.profiles(id),
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create table public.week_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  week_start date not null,
  status public.approval_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  return_reason text,
  unique (employee_id, week_start)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index time_entries_employee_date_idx on public.time_entries(employee_id, work_date);
create index time_entries_worksite_date_idx on public.time_entries(worksite_id, work_date);
create index time_entries_littera_date_idx on public.time_entries(littera_id, work_date);
create index worksites_number_idx on public.worksites(organization_id, number);

create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path=public
as $$ select organization_id from public.profiles where id=auth.uid() $$;

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;

create or replace function public.can_manage_worksite(p_worksite uuid) returns boolean
language sql stable security definer set search_path=public
as $$
  select public.current_app_role()='admin'
    or exists(select 1 from public.worksites w where w.id=p_worksite and w.foreman_id=auth.uid());
$$;

alter table public.organizations enable row level security;
alter table public.employers enable row level security;
alter table public.profiles enable row level security;
alter table public.worksites enable row level security;
alter table public.worksite_members enable row level security;
alter table public.litteras enable row level security;
alter table public.time_entries enable row level security;
alter table public.day_notes enable row level security;
alter table public.week_submissions enable row level security;
alter table public.audit_log enable row level security;

create policy org_read on public.organizations for select to authenticated
using (id=public.current_org_id());
create policy admin_org_update on public.organizations for update to authenticated
using (id=public.current_org_id() and public.current_app_role()='admin');

create policy employer_read on public.employers for select to authenticated
using (organization_id=public.current_org_id());
create policy employer_admin_all on public.employers for all to authenticated
using (organization_id=public.current_org_id() and public.current_app_role()='admin')
with check (organization_id=public.current_org_id() and public.current_app_role()='admin');

create policy profile_read on public.profiles for select to authenticated
using (organization_id=public.current_org_id());
create policy profile_admin_all on public.profiles for all to authenticated
using (organization_id=public.current_org_id() and public.current_app_role()='admin')
with check (organization_id=public.current_org_id() and public.current_app_role()='admin');
create policy profile_self_update on public.profiles for update to authenticated
using (id=auth.uid()) with check (id=auth.uid());

create policy worksite_read on public.worksites for select to authenticated
using (organization_id=public.current_org_id());
create policy worksite_admin_all on public.worksites for all to authenticated
using (organization_id=public.current_org_id() and public.current_app_role()='admin')
with check (organization_id=public.current_org_id() and public.current_app_role()='admin');

create policy member_read on public.worksite_members for select to authenticated
using (exists(select 1 from public.worksites w where w.id=worksite_id and w.organization_id=public.current_org_id()));
create policy member_admin_all on public.worksite_members for all to authenticated
using (public.current_app_role()='admin') with check (public.current_app_role()='admin');

create policy littera_read on public.litteras for select to authenticated
using (organization_id=public.current_org_id());
create policy littera_admin_all on public.litteras for all to authenticated
using (organization_id=public.current_org_id() and public.current_app_role()='admin')
with check (organization_id=public.current_org_id() and public.current_app_role()='admin');

create policy entry_read on public.time_entries for select to authenticated
using (
  organization_id=public.current_org_id() and (
    employee_id=auth.uid() or public.current_app_role()='admin' or public.can_manage_worksite(worksite_id)
  )
);
create policy entry_worker_insert on public.time_entries for insert to authenticated
with check (organization_id=public.current_org_id() and employee_id=auth.uid());
create policy entry_worker_update on public.time_entries for update to authenticated
using (employee_id=auth.uid() and status in ('draft','returned'))
with check (employee_id=auth.uid() and status in ('draft','returned'));
create policy entry_manager_update on public.time_entries for update to authenticated
using (organization_id=public.current_org_id() and (public.current_app_role()='admin' or public.can_manage_worksite(worksite_id)));

create policy note_read on public.day_notes for select to authenticated
using (organization_id=public.current_org_id() and (employee_id=auth.uid() or public.current_app_role() in ('foreman','admin')));
create policy note_manager_all on public.day_notes for all to authenticated
using (organization_id=public.current_org_id() and public.current_app_role() in ('foreman','admin'))
with check (organization_id=public.current_org_id() and author_id=auth.uid() and public.current_app_role() in ('foreman','admin'));

create policy week_read on public.week_submissions for select to authenticated
using (organization_id=public.current_org_id() and (employee_id=auth.uid() or public.current_app_role() in ('foreman','admin')));
create policy week_worker_insert on public.week_submissions for insert to authenticated
with check (organization_id=public.current_org_id() and employee_id=auth.uid());
create policy week_worker_update on public.week_submissions for update to authenticated
using (employee_id=auth.uid() and status in ('draft','returned'));
create policy week_manager_update on public.week_submissions for update to authenticated
using (organization_id=public.current_org_id() and public.current_app_role() in ('foreman','admin'));

create policy audit_admin_read on public.audit_log for select to authenticated
using (organization_id=public.current_org_id() and public.current_app_role()='admin');
create policy audit_insert on public.audit_log for insert to authenticated
with check (organization_id=public.current_org_id() and actor_id=auth.uid());

create or replace view public.daily_paid_hours with (security_invoker=true) as
select
  organization_id,
  employee_id,
  work_date,
  round((sum(extract(epoch from (end_time-start_time))/3600) -
    case when sum(extract(epoch from (end_time-start_time))/3600)>6 then 0.5 else 0 end)::numeric,2) as paid_hours
from public.time_entries
group by organization_id,employee_id,work_date;

create or replace function public.seed_default_litteras(p_organization_id uuid) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if public.current_app_role()<>'admin' or p_organization_id<>public.current_org_id() then raise exception 'Not allowed'; end if;
  insert into public.litteras(organization_id,code,name) values
  (p_organization_id,'1100','Purkutyöt'),(p_organization_id,'1200','Maanrakennus'),(p_organization_id,'2100','Anturat, mantteloinnit'),
  (p_organization_id,'3000','Runkorakenteet'),(p_organization_id,'3620','Parvekkeet, muotitus ja valu'),(p_organization_id,'3650','Elementtiparvekkeet'),
  (p_organization_id,'3760','Vesikaton puurunkotyöt'),(p_organization_id,'3765','Sisäänkäynnin katokset'),(p_organization_id,'3770','Parvekekatot'),
  (p_organization_id,'3775','Räystäiden jatko'),(p_organization_id,'5036','Pellit'),(p_organization_id,'5150','Vedenpoistot'),
  (p_organization_id,'5546','Rappaus'),(p_organization_id,'5550','Elastiset saumaukset'),(p_organization_id,'5560','Julkisivujen ranka- ja levytyö'),
  (p_organization_id,'5590','Eristerappaus'),(p_organization_id,'5600','Levyrappaus'),(p_organization_id,'5750','Yksikkösidonnaiset'),
  (p_organization_id,'5805','Hiekkapuhallus ja korkeapainepesu'),(p_organization_id,'5810','Ylitasoitustyöt'),(p_organization_id,'5815','Maalaus ja pinnoitus'),
  (p_organization_id,'8150','Aitaus ja kulkusuojaus'),(p_organization_id,'8160','Aputyöt, suojaus ja siivous'),(p_organization_id,'8180','Telineet ja nostimet'),
  (p_organization_id,'8200','Työmaan perustaminen ja lopettaminen')
  on conflict (organization_id,code) do update set name=excluded.name,active=true;
end;
$$;

revoke all on function public.seed_default_litteras(uuid) from public;
grant execute on function public.seed_default_litteras(uuid) to authenticated;
