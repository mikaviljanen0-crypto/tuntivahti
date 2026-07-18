-- Tuntikirjauksen seuraava vaihe: työntekijä saa poistaa oman luonnoksensa.
-- Suorita tämä Supabase SQL Editorissa ennen uuden käyttöliittymän testausta.

drop policy if exists entry_worker_delete on public.time_entries;
create policy entry_worker_delete on public.time_entries
for delete to authenticated
using (
  organization_id=public.current_org_id()
  and employee_id=auth.uid()
  and status in ('draft','returned')
);

drop policy if exists entry_admin_delete on public.time_entries;
create policy entry_admin_delete on public.time_entries
for delete to authenticated
using (
  organization_id=public.current_org_id()
  and public.current_app_role()='admin'
);
