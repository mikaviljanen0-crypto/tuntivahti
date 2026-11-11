-- Read-only net minutes. No entries, payroll snapshots or authorization policies
-- are changed. The full employee-day is required even when a foreman can only
-- read one of its worksites; only the requested, authorized entry's result leaves
-- this private helper. Never trust fields supplied in a composite RPC argument.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.time_entry_net_minutes(entry_id uuid)
returns integer
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target public.time_entries%rowtype;
  paid integer;
begin
  if caller is null then
    raise exception 'Kirjaudu sisään.' using errcode = '42501';
  end if;
  select e.* into target
  from public.time_entries e
  join public.profiles p on p.id = caller
    and p.active and p.organization_id = e.organization_id
  where e.id = entry_id
    and (e.employee_id = caller or p.role = 'admin' or exists (
      select 1 from public.worksites w
      where w.id = e.worksite_id and w.organization_id = e.organization_id
        and w.foreman_id = caller
    ));
  if not found then
    raise exception 'Kirjausta ei voi lukea.' using errcode = '42501';
  end if;

  with clock as (
    select e.id, e.start_time, e.end_time, floor(extract(epoch from e.start_time) / 60)::integer as s,
      floor(extract(epoch from e.end_time) / 60)::integer as f
    from public.time_entries e
    where e.organization_id = target.organization_id
      and e.employee_id = target.employee_id and e.work_date = target.work_date
  ), durations as (
    select *, greatest(0, f - s) as gross,
      greatest(0, least(f, 690) - greatest(s, 660)) as overlap
    from clock
  ), lunch as (
    select *, case when sum(gross) over () <= 360 then 0 else
      least(overlap, greatest(0, 30 - coalesce(sum(overlap) over (
        order by start_time, id rows between unbounded preceding and 1 preceding
      ), 0))) end::integer as first_cut
    from durations
  ), remainder as (
    select *, gross - first_cut as available,
      case when sum(gross) over () <= 360 then 0
        else 30 - sum(first_cut) over () end as remaining
    from lunch
  ), allocated as (
    select id, available - least(available, greatest(0, remaining - coalesce(
      sum(available) over (order by end_time desc, id rows between unbounded preceding and 1 preceding), 0
    ))) as net
    from remainder
  )
  select net::integer into paid from allocated where id = target.id;
  return paid;
end;
$$;
revoke all on function private.time_entry_net_minutes(uuid) from public, anon, authenticated;
grant execute on function private.time_entry_net_minutes(uuid) to authenticated;

-- An unnamed table-type argument makes this a PostgREST computed field, not an
-- /rpc endpoint. Invoker wrapper preserves row filtering and needs no BFF route.
create function public.review_net_minutes(public.time_entries)
returns integer language sql stable security invoker
set search_path = ''
as $$ select private.time_entry_net_minutes(($1).id) $$;
revoke all on function public.review_net_minutes(public.time_entries) from public, anon, authenticated;
grant execute on function public.review_net_minutes(public.time_entries) to authenticated;
comment on function public.review_net_minutes(public.time_entries) is
  'Read-only net minutes for an authorized entry, with one lunch deduction per full employee-day.';
notify pgrst, 'reload schema';
