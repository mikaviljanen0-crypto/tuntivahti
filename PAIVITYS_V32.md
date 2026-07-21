# Päivitys V32 – työntekijän kielet

Tämä päivitys lisää työntekijän käyttöliittymään suomen, albanian, englannin ja ukrainan. Työnjohto ja pääkäyttäjät säilyvät suomenkielisinä.

## 1. Päivitä tietokanta

Avaa Supabasen SQL Editor, liitä tiedoston `supabase/multilingual_worker_patch_009.sql` koko sisältö ja suorita se kerran.

## 2. Päivitä käyttäjähallinnan Edge Function

Korvaa Supabasen Edge Functionin `create-user` sisältö tiedostolla `supabase/functions/create-user/index.ts` ja julkaise funktio uudelleen. JWT-asetus säilyy samana kuin aiemmin.

## 3. Julkaise sovellus

Vie tämän paketin tiedostot GitHubiin. Vercel tekee uuden julkaisun automaattisesti.

## 4. Tarkista

1. Avaa pääkäyttäjän **Käyttäjät**-välilehti ja valitse työntekijälle kieli.
2. Avaa **Käännökset**-välilehti ja tarkista litteroiden käännökset.
3. Kirjaudu työntekijänä ja varmista, että kalenteri, tuntien kirjaus ja tilat näkyvät valitulla kielellä.

Albanian käännökset ovat käyttökelpoinen ensimmäinen versio. Albanian kieltä osaava henkilö voi tarkistaa yrityksenne rakennusalan termit, ja pääkäyttäjä voi korjata ne suoraan **Käännökset**-välilehdellä ilman uutta ohjelmistopäivitystä.
