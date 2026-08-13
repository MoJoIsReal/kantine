# Betaling

Dette er den delen som er verdt å tenke gjennom før dere bygger noe mer. Kort
oppsummert: **ikke bygg betaling inn i appen**. Det er både dyrere og mer
byråkratisk enn alternativet, og for en skolekantine er gevinsten liten.

## Regnestykket

Vipps tar ulik pris avhengig av hvordan pengene kommer inn:

| Løsning                        | Gebyr             | Krever              |
| ------------------------------ | ----------------- | ------------------- |
| Vippsnummer / handlekurv / QR  | 1,75 %            | Bare en Vipps-avtale |
| Betaling på nett (ePayment API)| 2,99 % + 1,00 kr  | Avtale + API-nøkler  |

Forskjellen ser liten ut i prosent, men kantinevarer er billige. Det er
kronetillegget som gjør utslaget:

| Varekjøp | Vippsnummer | ePayment API | Effektivt gebyr på nett |
| -------- | ----------- | ------------ | ----------------------- |
| 20 kr    | 0,35 kr     | 1,60 kr      | **8,0 %**               |
| 35 kr    | 0,61 kr     | 2,05 kr      | **5,9 %**               |
| 85 kr    | 1,49 kr     | 3,54 kr      | **4,2 %**               |

På et rundstykke til 20 kroner spiser betaling på nett åtte prosent av
omsetningen. Selger dere 60 varer om dagen til snitt 30 kroner, er det rundt
**4 000 kroner i året** i forskjell. For et elevdrevet kantineprosjekt er det
mye penger.

## Det andre problemet: elevene er under 15

Dette er lett å overse på en ungdomsskole. Barn mellom 6 og 15 år kan betale
til bedrifter og organisasjoner i Vipps, men **bare ved å skanne QR-kode eller
taste et Vippsnummer**. Begge foreldrene må ha godkjent det i sin egen Vipps
først, og funksjonen støttes foreløpig av DNB, Eika, SpareBank 1 og OBOS-banken
(rundt 70 % av Vipps-brukerne).

Det betyr at en del av elevene på trinnet uansett ikke kan gjennomføre en
vanlig betaling på nett. Løsningen med Vippsnummer treffer flere av dem.

## Anbefalingen

Bruk **Vippsnummer**, og la systemet håndtere bestilling og kø – ikke penger.

Flyten blir:

1. Eleven skanner plakaten, velger varer og legger inn navn og klasse.
2. Bestillingen får et hentenummer, for eksempel `#42`.
3. Kvitteringssiden sier: _«Vipps 85,00 kr til 123456, skriv #42 i meldingen.»_
4. Eleven vippser. Den som står i luka ser innbetalingen i Vipps-appen og
   trykker **Merk betalt** på ordren i dashbordet.
5. Kjøkkenet lager maten og setter ordren til _Klar_.

Dette er det systemet gjør som standard (`BETALINGSMETODE: "vipps_qr"`).

**Fordeler:** lavest gebyr, ingen API-integrasjon, ingen utvikleravtale, og det
fungerer for elevene under 15. Dere kan være i gang så snart Vipps-avtalen er
på plass.

**Ulempen:** noen må huke av for betalingene manuelt. I praksis er dette
uproblematisk – den som står i luka har Vipps-appen åpen uansett, og ser
innbetalingene komme inn med hentenummeret i meldingsfeltet.

## «Betal med Vipps»-knappen

Kvitteringssiden viser en knapp som åpner Vipps med mottakeren ferdig utfylt,
og referansen i en egen boks med kopiknapp.

Knappen bruker Vipps sitt personlige QR-format, som inneholder telefonnummeret
i klartekst:

```
https://qr.vipps.no/28/2/01/031/4793936700?v=1
```

Lenken lages automatisk fra `VIPPSNUMMER` – dere trenger ikke sette den opp
selv. Vil dere overstyre med en adresse fra Vippsportalen, finnes `VIPPS_LENKE`.

**Beløpet kan ikke fylles ut på forhånd.** Det finnes ingen støttet måte å
legge beløp inn i en slik lenke; `vipps://` er kun app-veksling for betalinger
som allerede er opprettet gjennom ePayment-API-et. Eleven må derfor taste
beløpet selv, og siden sier tydelig ifra om det. Vil dere ha beløpet ferdig
utfylt, er ePayment-API-et eneste vei – med gebyret og aldersgrensen det
innebærer.

To forbehold verdt å kjenne til:

- **Knappen krever et vanlig mobilnummer.** Et Vippsnummer for bedrifter er
  5–6 siffer og har ikke denne lenkeformen. Bruker dere et bedriftsnummer,
  faller siden pent tilbake til å vise nummeret uten knapp. Det er en reell
  avveining: bedriftsnummer er ryddigst for en skolekantine, men gir ingen
  knapp. Et privat mobilnummer gir knappen, men da går kantinepengene innom en
  privatpersons konto – noe skolen bør ta stilling til.
- **Vipps har varslet at de går over til QR-koder med token** i stedet for
  telefonnummer i klartekst. Skjer det, slutter lenken å virke, og da må dere
  over på ePayment-API-et. Referansen og nummeret på siden fungerer uansett.

### Referansen elevene limer inn

Meldingsfeltet er det eneste som knytter innbetalingen til bestillingen, så
den har fått egen boks med kopiknapp:

```
KANTINE Ordre: 42
```

Prefikset settes med `BETALINGSREFERANSE` i `wrangler.jsonc`. Hentenummeret
legges på automatisk.

### Praktiske råd for den manuelle varianten

- Skriv ut kantinas Vipps-QR fra Vippsportalen og heng den ved luka. Da slipper
  elevene å taste nummeret. Markedsmateriell er gratis, men bestill i god tid –
  trykk og frakt kan ta opptil ti dager.
- Ubetalte ordrer har gul stripe i dashbordet, betalte har grønn. Det gjør det
  lett å se hvem som ikke har gjort opp for seg.
- Admin-siden viser _Utestående_ for dagen. Er det tall der ved stengetid, er
  det noe som ikke stemmer.

## Slik skaffer dere Vippsnummeret

Dette er den delen som tar lengst tid, så start med den.

Skolen har som regel ikke egen bankkonto – kontoen tilhører kommunen eller
fylkeskommunen. Det betyr at **hovedavtalen må signeres av noen med
signaturrett der**, ikke av en lærer. Finn ut hvem det er tidlig; det er ofte
en økonomisjef eller kommunalsjef.

Alternativet mange skoler bruker: la FAU, elevrådet eller en elevbedrift stå
som avtalepart. Da trengs et eget organisasjonsnummer, og det er gratis å
registrere i Brønnøysundregistrene. Enheten som eier kontoen må være den samme
som står på Vipps-avtalen.

Snakk med banken skolen bruker – de fleste norske banker har egne sider for
«Vipps til lag, foreninger og skoler» og hjelper til med bestillingen.

## Hvis dere likevel vil ha automatisk betaling

Koden ligger klar. Bytt `BETALINGSMETODE` til `vipps_epayment` i
`wrangler.jsonc` og legg inn nøklene fra Vippsportalen:

```bash
npx wrangler secret put VIPPS_CLIENT_ID
npx wrangler secret put VIPPS_CLIENT_SECRET
npx wrangler secret put VIPPS_SUBSCRIPTION_KEY
npx wrangler secret put VIPPS_MSN
```

Sett `VIPPS_MILJO` til `"test"` mens dere prøver (Vipps sitt testmiljø bruker
falske penger), og til `"produksjon"` når dere er klare.

Da skjer dette i stedet: eleven trykker **Betal**, Vipps-appen åpner seg med
riktig beløp, og ordren merkes betalt automatisk når betalingen er godkjent.
Ingen avhuking på kjøkkenet. `src/betaling/vipps_epayment.js` håndterer
token, oppretting av betaling, statussjekk og trekk av pengene.

To ting å være klar over:

- **Det er ikke testet mot ekte Vipps-nøkler.** Koden følger dokumentasjonen,
  men noen må kjøre den mot testmiljøet før den brukes på ekte penger.
- Statusen hentes ved at kvitteringssiden spør serveren, som spør Vipps. Lukker
  eleven nettleseren midt i betalingen, blir ordren stående som ubetalt til
  noen åpner den igjen. Skal dette være helt vanntett, bør dere sette opp
  webhooks fra Vipps i tillegg.

## Andre alternativer, og hvorfor de ikke ble valgt

- **Stripe / kortbetaling.** Fungerer teknisk, men ungdomsskoleelever har sjelden
  betalingskort, og gebyret er i samme størrelsesorden. Vipps er dessuten det
  alle allerede har på telefonen.
- **Kontant.** Fortsatt lov, men lite praktisk, og da trenger dere ikke noe
  system for det uansett.
- **Faktura til foresatte / forskuddskonto.** Betyr at dere lagrer saldo og
  gjeld knyttet til navngitte elever. Det er en helt annen diskusjon både
  personvernmessig og administrativt, og bør ikke gjøres uten at skolen har
  tatt stilling til det.

## Kilder

Prisene og reglene over er hentet fra Vipps MobilePay i august 2026. Sjekk dem
før dere signerer noe – Vipps endrer priser fra tid til annen.

- [Priser hos Vipps MobilePay](https://vippsmobilepay.com/nb-NO/pricing)
- [Barn under 15 kan betale til bedrifter](https://vipps.no/news/2025/2/u15-vippsnummer)
- [Vipps til lag, foreninger og skoler](https://www.spv.no/dagligbank/betaling/vipps/vipps-bedrift/vipps-til-lag-forening-skoler)
- [ePayment API](https://developer.vippsmobilepay.com/docs/APIs/epayment-api/)
