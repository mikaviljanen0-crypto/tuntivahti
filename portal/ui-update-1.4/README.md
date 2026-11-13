# TJT Tunnit 1.4

Tämä päivitys tuo portaalin Tunnit-näkymään yhteisen TJT-ilmeen sekä mobiiliin sopivan asettelun. Se edellyttää asennettua Tunnit 1.3 -versiota, jossa ovat nettotunnit ja sukunimijärjestys. Päivitys koskee vain Tuntien selainosaa.

Nettotuntien laskenta, ruokataukovähennys ja työntekijöiden sukunimijärjestys säilyvät. Tuntikirjauksia, hyväksyntöjä, suljettuja palkkakausia, työntekijöitä, käyttöoikeuksia, tunnusyhdistyksiä ja tietokantaa ei muuteta. Portaalin, Laatuvahdin, Laskennan, Aikataulun ja Työmaavahdin aiemmat päivitykset säilyvät.

## Asennus

Tallenna avoimet tuntimuutokset ennen sivun päivittämistä. Lataa `TJT-Portaali-Tunnit-1.4.zip` TJT-PALVELIMEN Lataukset-kansioon. Avaa Windows PowerShell järjestelmänvalvojana.

```powershell
$kohde = "$env:USERPROFILE\Downloads\TJT-Portaali-Tunnit-1.4"
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\TJT-Portaali-Tunnit-1.4.zip" -DestinationPath $kohde -Force
Set-Location $kohde
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\01-Tarkista-Tunnit.ps1"
```

Kun tarkistus onnistuu:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\02-Asenna-Tunnit.ps1"
```

Odota VALMIS-ilmoitusta. Päivitä Tunnit-sivu Ctrl+F5. Puhelimella sulje Tuntien välilehti ja avaa Tunnit portaalista uudelleen. Jos ZIPin nimeen tuli latauksessa numero, käytä purkukomennossa tiedoston todellista nimeä.

## Tarkistus

Tarkista tuttu viikko ja kuukausi, nettotunnit, työntekijöiden järjestys, työmaasuodatus ja yhden päivän tuntierittely. Kokeile myös mobiilinäkymää, vaaleaa/tummaa teemaa ja paluuta Työpöydälle. Hyväksyntä ja muut muutoksia tekevät toiminnot toimivat nykyisillä oikeuksilla.

Asentaja varmistaa nykyiset ohjelmatiedostot, tunnetun Tunnit 1.3 -lähtöversion sekä uuden paketin tarkistussummat. Se varmuuskopioi korvattavat ohjelmatiedostot ja vaihtaa uudet resurssit ennen aloitussivua. Palvelut jatkavat käynnissä. Varmuuskopiointiajastuksiin tai muihin palveluihin ei tehdä muutoksia.

Jos tarkistus pysähtyy, älä ohita sitä. Kopioi koko virhe keskusteluun. Myös jo asennettu päivitys tunnistetaan.

## Palautus

Asentaja tulostaa palautuskansion. Tallenna avoimet muutokset ja suorita samasta päivityskansiosta:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\03-Palauta-Tunnit.ps1" -Palautuskansio "ASENTAJAN TULOSTAMA PALAUTUSKANSIO"
```

Palautus palauttaa tämän päivityksen korvaamat selainresurssit ja yhdistää vain niiden tiedot nykyiseen asennusmanifestiin. Muiden ohjelmien myöhemmät päivitykset säilyvät. Vanhat ja uudet hashatut selainresurssit säilytetään avoimia välilehtiä varten. Jos Tuntien samaa käyttöliittymää on myöhemmin muutettu, palautus pysähtyy.

Päivitys ei sisällä tietokantamuutoksia, pilvijulkaisua tai tallennettujen tietojen poistoa. Windows PowerShellin suoritus ja toiminta oikeilla laitteilla varmistetaan palvelimella.
