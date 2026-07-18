-- Estää tavallista käyttäjää muuttamasta omaa rooliaan tai organisaatiotaan.
drop policy if exists profile_self_update on public.profiles;
