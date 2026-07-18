# Tuotantoversion käyttöönotto

## Valittu rakenne

- Supabase: kirjautuminen, PostgreSQL-tietokanta ja käyttöoikeudet
- Vite: selainkäyttöliittymä
- Vercel: verkkopalvelun julkaisu
- Työmaavahti ja Tuntivahti käyttävät samaa työmaarekisteriä

Työmaa perustetaan vain Työmaavahdissa. Tuntivahti lukee työmaan numeron, nimen, tilan ja vastuuhenkilön samasta tietokannasta. Suljettu työmaa löytyy tuntikirjauksessa numerolla tai nimellä, mutta sitä ei perusteta uudelleen.

## Ensimmäinen käyttöönotto

1. Luo Supabase-projekti.
2. Avaa Supabase Dashboardissa SQL Editor.
3. Suorita `supabase/schema.sql`.
4. Suorita tietokantapäivitykset numerojärjestyksessä: `security_patch_001.sql` ja `time_entries_patch_002.sql`.
5. Luo ensimmäinen kirjautuva käyttäjä Supabase Auth -näkymässä.
6. Lisää organisaatio, työnantaja ja ensimmäisen käyttäjän `profiles`-rivi.
7. Anna ensimmäiselle käyttäjälle rooli `admin`.
8. Kutsu `seed_default_litteras` organisaation tunnisteella.
9. Kopioi `.env.example` nimelle `.env.local` ja lisää Supabasen URL sekä julkinen publishable-avain.
10. Julkaise sovellus Verceliin ja lisää samat ympäristömuuttujat Vercelin projektiasetuksiin.

## Sovitut käyttöperiaatteet

- työmaanumero on pakollinen ja yrityksessä yksilöllinen
- numero näytetään aina työmaan nimen yhteydessä
- työntekijä kirjaa ajat jälkikäteen
- saman päivän seuraava kirjaus jatkuu edellisen loppuajasta
- yli kuuden tunnin päivän lopputunneista vähennetään 0,5 tuntia
- litteranumero tallennetaan erillisenä kustannuskohdistuksena
- työnjohtaja hyväksyy viikon ja voi lisätä päiväkohtaisen huomautuksen
- pääkäyttäjä näkee kuukausiraportit työmaittain, työntekijöittäin ja litteroittain
