# Tuntivahti

## Tuotantoversio

Sovellus on siirtymässä React/Vite- ja Supabase-pohjaan. Tuotantopohjassa on oikea sähköpostikirjautuminen, pääkäyttäjän rooli sekä yhteinen työmaarekisteri Tuntivahdille ja Työmaavahdille.

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

## Käyttö

Avaa `index.html` selaimessa. Sovellus ei vaadi asennusta ja testitiedot tallentuvat selaimeen.

## Seuraava vaihe

- oikeat käyttäjätunnukset ja henkilökohtaiset linkit/QR-koodit
- tietokanta ja turvallinen yrityskohtainen tallennus
- viikkojen selaus ja palkanlaskennan raportit
- julkaisu verkkoon
