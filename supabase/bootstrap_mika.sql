-- Ensimmäinen organisaatio ja pääkäyttäjä
-- Käyttäjä: mika.viljanen0@gmail.com

do $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations
  where name='Tampereen Julkisivutekniikka Oy'
  order by created_at limit 1;

  if v_org is null then
    insert into public.organizations(name)
    values ('Tampereen Julkisivutekniikka Oy')
    returning id into v_org;
  end if;

  insert into public.employers(organization_id,name) values
    (v_org,'Visar Oy'),
    (v_org,'Sami P Saneeraus Oy'),
    (v_org,'Tampereen Julkisivutekniikka Oy')
  on conflict (organization_id,name) do update set active=true;

  insert into public.profiles(id,organization_id,full_name,role,active)
  values ('12596778-0ebc-4098-9072-0d78f3873dbd',v_org,'Mika Viljanen','admin',true)
  on conflict (id) do update set
    organization_id=excluded.organization_id,
    full_name=excluded.full_name,
    role='admin',
    active=true;

  insert into public.litteras(organization_id,code,name) values
    (v_org,'1100','Purkutyöt'),(v_org,'1200','Maanrakennus'),(v_org,'2100','Anturat, mantteloinnit'),
    (v_org,'3000','Runkorakenteet'),(v_org,'3620','Parvekkeet, muotitus ja valu'),(v_org,'3650','Elementtiparvekkeet'),
    (v_org,'3760','Vesikaton puurunkotyöt'),(v_org,'3765','Sisäänkäynnin katokset'),(v_org,'3770','Parvekekatot'),
    (v_org,'3775','Räystäiden jatko'),(v_org,'5036','Pellit'),(v_org,'5150','Vedenpoistot'),
    (v_org,'5546','Rappaus'),(v_org,'5550','Elastiset saumaukset'),(v_org,'5560','Julkisivujen ranka- ja levytyö'),
    (v_org,'5590','Eristerappaus'),(v_org,'5600','Levyrappaus'),(v_org,'5750','Yksikkösidonnaiset'),
    (v_org,'5805','Hiekkapuhallus ja korkeapainepesu'),(v_org,'5810','Ylitasoitustyöt'),(v_org,'5815','Maalaus ja pinnoitus'),
    (v_org,'8150','Aitaus ja kulkusuojaus'),(v_org,'8160','Aputyöt, suojaus ja siivous'),(v_org,'8180','Telineet ja nostimet'),
    (v_org,'8200','Työmaan perustaminen ja lopettaminen')
  on conflict (organization_id,code) do update set name=excluded.name,active=true;
end $$;

select
  p.full_name,
  p.role,
  o.name as organization,
  (select count(*) from public.employers e where e.organization_id=o.id) as employers,
  (select count(*) from public.litteras l where l.organization_id=o.id) as litteras
from public.profiles p
join public.organizations o on o.id=p.organization_id
where p.id='12596778-0ebc-4098-9072-0d78f3873dbd';
