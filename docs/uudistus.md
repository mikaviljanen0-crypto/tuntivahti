# Tuntivahdin käyttöliittymäuudistus

## Toteutus ja rajaus

React-käyttöliittymä on uusittu nykyisen Supabase-palvelun päälle. Nykyiset kirjautumiset, roolit, organisaatiorajaus, käyttäjät, työmaat ja palkkakausien lukot säilyvät. Tuotantotietokantaan ei ole tehty muutoksia tämän työn aikana.

Työntekijä käyttää julkista Tuntivahti-osoitetta omilla tunnuksillaan. Tailscalea ei vaadita. Työnjohtaja voi avata saman palvelun TJT-portaalin Tunnit-kortista. Pelkkä linkki ei muodosta kertakirjautumista: portaalin ja Supabasen istunnot ovat edelleen erilliset.

## Portaalin linkitys

Lisää portaalin olemassa olevaan sovellusrekisteriin työnjohdon/pääkäyttäjän nykyisellä käyttöoikeusmallilla kortti:

| Kenttä | Arvo |
| --- | --- |
| Nimi | Tunnit |
| Kuvaus | Tuntien tarkistus ja raportit |
| Kohde | `https://tuntivahti.vercel.app/?view=review` |
| Työntekijöiden linkki | `https://tuntivahti.vercel.app/` |

Älä lisää työntekijöitä portaalin Tailscale-verkkoon tätä varten. Älä välitä salasanoja tai istuntotunnuksia URL-osoitteessa. Tuntivahdin takaisin-linkin voi määrittää ympäristömuuttujalla `VITE_PORTAL_URL`; oletus on nykyinen TJT-portaali. Portaalin palvelinlähdettä tai käynnissä olevaa palvelua ei ole muutettu tässä haarassa.

## Käyttöönotto

1. Tarkista erillinen GitHub-haara ja sen Vercel-esikatselu ennen päähaaraan yhdistämistä.
2. Varmista Vercelin Preview-ympäristön `VITE_SUPABASE_URL` ja `VITE_SUPABASE_PUBLISHABLE_KEY` (tai nykyinen `VITE_SUPABASE_ANON_KEY`). Älä käytä service role -avainta selaimessa.
3. Jos esikatselu osoittaa nykyiseen Supabaseen, sen kirjautuneet käyttäjät käsittelevät **oikeita tuotantokirjauksia**. Esikatselun URL ei itsessään eristä tietokantaa. Käytä kirjoittaviin hyväksymistesteihin erillistä testiprojektia tai nimenomaisesti sovittua testikäyttäjää/-aineistoa.
4. Varmista normaali kirjautuminen työntekijän ja työnjohdon tunnuksella. Tämän työn selainkirjoitustestit käyttivät vain kehitysympäristön muistissa olevaa kuvitteellista aineistoa, eivät Supabasea.
5. Tarkista oikeilla tiedoilla lukutilassa yhden tunnetun viikon tunnit sekä kuukauden raportti. Testaa erillisellä testiaineistolla suljetun kuukauden kirjoitusesto ja työnjohtajan työmaarajaus.
6. Hyväksytyn testin jälkeen yhdistä haara `main`-haaraan nykyistä Vercel-julkaisua varten. Ei uusia SQL-päivityksiä tähän UI-uudistukseen.
7. Lisää portaalin Tunnit-kortti erikseen nykyisen portaalijulkaisun kautta.

Palautus: julkaise edellinen `main`-version commit Vercelissä. Uudistus ei edellytä tietokannan palauttamista.

## Laskenta ja raportit

- Yli kuuden tunnin päivästä vähennetään 30 min vain kerran työntekijää ja päivää kohti.
- Vähennys kohdistetaan ensin klo 11.00–11.30 päälle osuviin kirjauksiin. Jäljelle jäävä osa vähennetään lopusta, tarvittaessa usealta riviltä, jotta lyhyt viimeinen kirjaus ei hukkaa tauon loppuosaa.
- Raportin rajaus tehdään vasta koko päivän taukokohdistuksen jälkeen. Työmaa- tai hyväksyntäsuodatin ei laske taukoa uudestaan.
- Työnjohdon viikkotaulukko näyttää bruttotunnit, ja tämä on merkitty selvästi. Työnjohtaja ei välttämättä saa lukea työntekijän muiden työmaiden kirjauksia. Nettoraportointi on pääkäyttäjän näkymässä.
- Raportti sisältää oletuksena kaikki tilat. Hyväksymättömät tunnit on merkitty erikseen. Raportit eivät sisällä laskutushintoja.
- CSV on UTF-8/BOM, puolipiste-eroteltu, ja suojaa tekstikenttien kaava-alkuiset arvot. Se ei ole XLSX-tiedosto.
- Palautus vaatii syyn. Suljetun palkkakauden muutokset estetään käyttöliittymässä ja olemassa olevilla RLS-säännöillä.
- Kirjausten ja huomautusten haku on sivutettu, joten yli 1000 riviä sisältävä raportti ei katkea Supabasen oletusrajaan.

## Testaus

`npm test` testaa laskennan, monen työmaan päivän, 6 h rajan, osittaisen lounasajan, lyhyen viimeisen rivin, raporttisuodattimet, päällekkäiset ajat, vuodenvaihteen/kesäajan viikon, CSV-merkinnät sekä tietokantasovittimen rajaukset, sivutuksen ja virhepalautteet.

Tietokantasovittimen testit ovat mock-testejä; ne eivät todenna tuotannon RLS-sääntöjä. Tallennus ja päivän lähetys ovat erillisiä kutsuja: jos lähetys epäonnistuu tallennuksen jälkeen, käyttäjälle ilmoitetaan, että kirjaus jäi luonnokseksi. Huomautuksen tallennus ja hyväksyntä ovat myös erilliset kutsut, kuten vanhassa toteutuksessa. Osittainen hyväksyntä näytetään virheenä ja näkymä ladataan uudelleen.

Selain-QA kuvitteellisella aineistolla: työnjohdon viikkotaulukko, päivädialogi, hyväksyntä, työntekijän muokkaus, kaksi työmaata samana päivänä (7–10 ja 10–15.30 → 3 h + 5 h), lähetys, mobiilin 390 px näkymä ja albaniankielinen näkymä. Kehitysdemoa ei sisälly tuotantokäännökseen.

## Ei vielä tässä muutoksessa

- Työmaavahdin QR-leimausten tuonti, läsnäoloajan ja palkallisen ajan yhteinen työnkulku.
- Työmaakohtainen litteravalikoima ja mahdollisuus lähettää kirjaus ilman litteraa. Nykyinen tietokanta edellyttää litteraa; tätä ei muuteta pelkällä käyttöliittymäpäivityksellä.
- Portaalin ja Tuntivahdin kertakirjautuminen.
- Viranomaisraporttien uusi toteutus tai laskutusjärjestelmä.

Näihin tarvitaan erillinen tietomalli- ja integraatiomuutos. Niitä ei pidä tulkita valmiiksi tämän käyttöliittymäversion perusteella.
