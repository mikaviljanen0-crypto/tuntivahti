# TJT Tunnit 1.4 – yhteinen ilme

Portaalin Tunnit saa saman TJT-ilmeen kuin muut työkalut: vihreä ylätunniste,
Työpöytä-paluu sekä yhteinen vaalea/tumma teema (`tjt.workspace.theme`).
Mobiilissa työntekijän tuntipäivät avataan tiiviistä korteista. Työpöydällä
säilyy viikon ja kuukauden taulukko. Tilin yhdistämisen hallinta löytyy
ylätunnisteen käyttäjäkuvakkeesta.

Tämä selainpäivitys perustuu Tunnit 1.3:n lähdekoodiin, commit
`2a6c03adbe096c39174e811543c850ca014dc758`. Nettotuntien laskenta,
ruokataukovähennys, sukunimijärjestys, hyväksyntä, palautus ja suljetun
palkkakauden säännöt säilyvät. Rajapintoja, tietokantaa, käyttäjien oikeuksia
tai portaalin tunnusyhdistyksiä ei muuteta.

## Tarkistukset

- Nykyiset sovelluksen ja portaalin testit: 97/97 läpi. Mukana nettotunnit,
  ruokatauon kohdistus eri työmaille, sukunimijärjestys, hyväksyntä,
  lukitut palkkakaudet sekä kirjautumisen ja käyttöoikeuksien rajaukset.
- Uuden staattisen asentajan testit: 14/14 läpi.
- Paikallinen selaintestaus keksityillä tiedoilla: työpöytä sekä 320 ja
  393 pikselin mobiilinäkymät, nettotunnit, päivän avaaminen, hyväksyntä,
  palautus ja teemavaihto.
- Tunnit 1.3:n lähtökooste tuotettiin lähdekoodista ja verrattiin aiempaan
  asennuspakettiin; kaikki selainresurssit täsmäsivät tavulleen.

Windows PowerShellin suoritus ja toiminta käyttäjien oikeilla laitteilla
varmistetaan asennettaessa TJT-PALVELIMELLE. Paikalliset selaintestit eivät
käytä tuotantotietoja.

## Koostaminen ja käyttöönotto

```sh
npm ci
npm test
VITE_PORTAL_MODE=true VITE_PORTAL_URL=/ VITE_READ_ONLY_PREVIEW=false npm run build -- --outDir dist-portal
node --test portal/ui-update-1.4/tests/ui-update.test.mjs
node portal/ui-update-1.4/package.mjs /absolute/path/dist-portal /absolute/new/path/TJT-Portaali-Tunnit-1.4
```

Asennus- ja palautusohjeet ovat tiedostossa `portal/ui-update-1.4/README.md`.
Asentaja vaihtaa vain Tuntien selainresurssit, tekee ohjelmatiedostojen
palautuskopion ja säilyttää muiden sovellusten nykyiset manifestimerkinnät.
Palvelua ei tarvitse käynnistää uudelleen.

Muutokset valmistellaan haarassa `codex/tjt-tunnit-ilme-1.4`. Haaran ja
luonnos-PR:n tallennus ei ole `main`-haaran yhdistäminen eikä Windows-asennus.
Vercel rakentaa erillisen Tuntivahdin tuotantoversion `main`-haarasta, joten
tämän portaalipäivityksen toimitus ei edellytä siihen yhdistämistä.
