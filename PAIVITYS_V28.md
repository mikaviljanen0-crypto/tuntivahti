# Tuntivahti v28 – työnjohtajan korjaukset

Tämä paketti sisältää myös v27:n puhelinkirjautumisen ilman SMS-palvelua.

## Uusi SQL-päivitys

Suorita Supabasen SQL Editorissa:

`supabase/foreman_corrections_patch_008.sql`

SQL lisää muutoshistorian litteran ja hyväksyntätilan muutoksille. Nykyiset palkkakauden
lukitukset jäävät voimaan.

## GitHub

Vie päivityspaketin sisältö GitHubiin ja odota Vercelin valmistumista.

## Uudet työnjohtajan toiminnot

- Avaa päivä työnjohtajan näkymässä.
- Avoimella palkkakaudella littera voidaan vaihtaa suoraan työvaiheen valikosta.
- Vain uusi littera on voimassa raporteissa ja kustannusseurannassa.
- Hyväksytty päivä voidaan palauttaa työntekijälle korjattavaksi.
- Palautuksen syy kirjoitetaan työnjohtajan huomautukseen.
- Suljetulla palkkakaudella kirjauksia, litteraa ja huomautusta ei voi muuttaa.
