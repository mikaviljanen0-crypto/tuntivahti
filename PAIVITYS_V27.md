# Tuntivahti v27 – kirjautuminen puhelinnumerolla ilman SMS-palvelua

## 1. Supabase Authentication

- Avaa **Authentication → Sign In / Providers → Phone**.
- Poista **Enable Phone provider** käytöstä ja tallenna.
- Twiliota tai muuta SMS-palvelua ei tarvita.

## 2. Tietokanta

Suorita SQL Editorissa tiedosto:

`supabase/phone_login_patch_007.sql`

## 3. Päivitä create-user

Korvaa nykyisen `create-user` Edge Functionin `index.ts` tiedoston sisällöllä:

`supabase/functions/create-user/index.ts`

Ota funktio käyttöön painamalla **Deploy function**.

## 4. Luo login-with-phone

Luo uusi Edge Function nimellä `login-with-phone` ja kopioi siihen:

`supabase/functions/login-with-phone/index.ts`

Ota funktio käyttöön painamalla **Deploy function**. Avaa tämän funktion **Settings** ja kytke
**Verify JWT with legacy secret** pois päältä. Tämä kirjautumisfunktio kutsutaan ennen kuin
käyttäjällä on kirjautumisistunto. Salasana tarkistetaan silti Supabase Authissa.

## 5. GitHub ja käyttäjät

- Vie päivityspaketin sisältö GitHubiin ja odota Vercelin valmistumista.
- Lisää nykyisten käyttäjien puhelinnumerot kohdasta **Käyttäjät → Muokkaa**.
- Käyttäjä voi tämän jälkeen kirjautua samalla salasanalla joko puhelinnumerolla tai sähköpostilla.
- Unohtuneen salasanan vaihtolinkki lähetetään sähköpostiin.
