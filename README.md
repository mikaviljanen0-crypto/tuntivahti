# Tuntivahti

## Version 15 – työntekijän tuntilappu

Pääkäyttäjän Raportit-näkymässä on työntekijäkohtainen tuntilappu, joka voidaan rajata kuukaudelle, vapaalle aikavälille ja työmaalle. Tuntilapun voi ladata CSV-tiedostona tai tulostaa selaimesta PDF-muotoon.

Raportit ja Tuntilaput ovat pääkäyttäjällä erilliset valikot. Omat tunnit näkyy vain tuntikirjauksia tekevillä työntekijöillä; kuukausipalkkaiset työnjohtajat eivät täytä tuntilappua.

## Version 14 – raportointi ja muodollinen hyväksyntä

- Kuukausiraportti voidaan rajata työmaalle.
- Tunnit ryhmitellään työmaan ja litteran mukaan; nollarivejä ei näytetä.
- Kaikki kirjaukset näkyvät listoissa, raporteissa, laskutuspohjassa ja CSV-tiedostossa hyväksyntätilasta riippumatta.
- Hyväksymättömät tunnit näytetään erillisenä huomautuksena, mutta ne sisältyvät aina kokonaistunteihin.
- Ruokatauon 0,50 h vähennys kohdistuu työntekijän päivän viimeiseen työvaiheeseen, kun päivän työaika ylittää 6 tuntia.
- Pääkäyttäjä voi avata työntekijäkohtaisen tuntilapun kuukaudelta tai vapaalta aikaväliltä, rajata sen työmaalle sekä tallentaa CSV:n tai tulostaa PDF:n.
- Tuntilapulla näkyvät päivittäiset kellonajat, työmaanumerot, litterat, maksettavat tunnit, hyväksyntätilat ja työnjohtajan kommentit.

## Tuotantoversio

Sovellus käyttää React/Vite- ja Supabase-pohjaa. Tuotantoversiossa on sähköpostikirjautuminen, roolit, yhteinen työmaarekisteri, pääkäyttäjän käyttäjähallinta, työnjohtajan työmaanäkymä ja jälkikäteen tehtävä tuntikirjaus.

Työntekijän kuukausikalenteri näyttää kirjatut tunnit ja korostaa menneet arkipäivät, joilta kirjaukset puuttuvat. Pääkäyttäjä osoittaa jokaiselle työmaalle vastuullisen työnjohtajan; sama työnjohtaja voi vastata useasta työmaasta.

Työnjohtaja voi rajata näkymän työmaan sekä alku- ja loppupäivän perusteella. Saman työntekijän samana päivänä samalla työmaalla tekemät työvaiheet ryhmitellään yhden otsikon alle, ja jokaisesta työvaiheesta näytetään oma kellonaika ja littera.

Käynnistys kehitysympäristössä:

```bash
npm install
npm run dev
```

Ympäristömuuttujat kopioidaan `.env.example`-tiedostosta `.env.local`-tiedostoon. `.env.local` ei kuulu GitHubiin.

Tampereen Julkisivutekniikka Oy:n kevyt tuntikirjaussovellus.

Työntekijä täyttää työajat jälkikäteen valitsemalla päivän, työmaan, alku- ja loppuajan sekä litteran. Päivän eri työvaiheet voidaan kirjata eri litteroille. Uuden kirjauksen aloitusaika jatkuu automaattisesti saman päivän edellisen kirjauksen lopetusajasta. Yli kuuden tunnin työpäivästä vähennetään lopullisista päivätunneista automaattisesti 30 minuuttia ilman erillistä ruokataukoriviä.

Litterarekisteri perustuu tiedostoon `TJT Litterat(2).xlsx`. Kirjauksessa litteranumero säilytetään erillisenä kustannuskohdistuksena taloushallinnon raportointia varten.

Työnjohto voi lisätä työntekijä- ja päiväkohtaisen huomautuksen. Huomautus näkyy työntekijän tuntinäkymässä ja säilyy myöhempää tuntilappua sekä raportointia varten.

Pääkäyttäjän demossa on yrityksen yhteenveto sekä kuukausiraportit työmaittain, työntekijöittäin ja litteroittain. Päiväkohtainen erittely toimii laskun liitteenä ja tiedot voi ladata CSV-muodossa taloushallintoa varten.

Jokaisella työmaalla on pakollinen työmaanumero. Numero näytetään työmaan nimen yhteydessä kaikissa näkymissä ja viedään CSV-raporttiin omana kenttänään taloushallinnon selainrobottia varten.

## Tietokantapäivitykset

Suorita `supabase`-hakemiston SQL-päivitykset Supabase SQL Editorissa numerojärjestyksessä. `time_entries_patch_002.sql` sallii työntekijän poistaa vain oman luonnos- tai palautetun tuntikirjauksensa. `user_management_patch_003.sql` lisää profiileihin sähköpostin salasanan palautusta varten.

## Käyttäjien lisääminen

Pääkäyttäjän käyttäjälomake käyttää Supabase Edge Functionia `create-user`. Julkaise funktio Supabase-projektiin ennen lomakkeen käyttöä:

```bash
supabase functions deploy create-user
```

Supabase antaa funktiolle `SUPABASE_URL`-, `SUPABASE_ANON_KEY`- ja `SUPABASE_SERVICE_ROLE_KEY`-ympäristömuuttujat automaattisesti. Service role -avainta ei lisätä Verceliin tai selainkoodiin.

Salasanan palautusta varten Supabase Authenticationin Site URL- ja Redirect URL -asetuksiin lisätään `https://tuntivahti.vercel.app`.

## Seuraava vaihe

- työntekijöiden turvallinen kutsuminen sovelluksesta
- viikkojen lähetys ja työnjohtajan hyväksyntä
- kuukausiraportit ja CSV-vienti
