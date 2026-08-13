# Kantine

Bestillingssystem for en skolekantine. Elevene skanner en QR-kode, velger fra
menyen, betaler med Vipps og henter i luka. Kjøkkenet ser bestillingene komme
inn på en tavle.

Bygget for å kjøre gratis på Cloudflare sitt gratisnivå.

## Hva som følger med

| Side        | Hvem                   | Hva                                                        |
| ----------- | ---------------------- | ---------------------------------------------------------- |
| `/`         | Elevene                | Meny, handlekurv og bestilling                              |
| `/kvittering` | Eleven som bestilte  | Hentenummer, betalingsinfo og status                        |
| `/kjokken`  | De som står i luka     | Ordretavle med Nye / Lages nå / Klare, og avhuking av betaling |
| `/admin`    | Læreren                | Meny, priser, lager, åpningstider og dagsoppgjør            |

Ordretavla oppdaterer seg selv, så den kan stå på en skjerm i kantina.

## Betaling – les dette først

Systemet er satt opp med Vippsnummer og manuell bekreftelse. Det er både
billigere og enklere å komme i gang med enn betaling på nett, og det fungerer
for elever under 15 år. **[docs/BETALING.md](docs/BETALING.md)** forklarer
hvorfor, hva det koster, og hva dere må gjøre for å få en Vipps-avtale.

Full Vipps-integrasjon med automatisk bekreftelse ligger ferdig i koden, og
skrus på med én linje i oppsettet når dere eventuelt vil ha det.

## Hva det koster å drifte

Ingenting, med normale mengder for en skolekantine.

Cloudflare sitt gratisnivå gir 100 000 forespørsler i døgnet og en D1-database
på 5 GB. En skole med 400 elever ligger typisk på noen tusen forespørsler om
dagen. Det eneste dere betaler er Vipps-gebyret på 1,75 % av salget.

## Kom i gang

Krever [Node.js](https://nodejs.org) og en gratis Cloudflare-konto.

```bash
npm install
npx wrangler login
```

### 1. Lag databasen

```bash
npx wrangler d1 create kantine
```

Kommandoen skriver ut en `database_id`. Lim den inn i `wrangler.jsonc`, der det
står `REPLACE_ME`.

Deretter lager du tabellene og legger inn en eksempelmeny:

```bash
npm run db:init:remote
npm run db:seed:remote
```

### 2. Sett PIN-koder

Kjøkkenet og admin logger inn med hver sin PIN. De lagres som hemmeligheter hos
Cloudflare, ikke i koden.

```bash
npx wrangler secret put ANSATT_PIN    # for de som står i luka
npx wrangler secret put ADMIN_PIN     # for læreren
```

Bruk to forskjellige koder. Admin-PIN gir tilgang til priser og dagsoppgjør,
ansatt-PIN bare til ordretavla.

### 3. Legg inn Vippsnummer og navn

I `wrangler.jsonc`:

```jsonc
"vars": {
  "KANTINE_NAVN": "Kantina på Bjørnsletta",
  "BETALINGSMETODE": "vipps_qr",
  "VIPPSNUMMER": "123456"
}
```

### 4. Publiser

```bash
npm run deploy
```

Adressen blir noe i retning av `https://kantine.<brukernavn>.workers.dev`.

### 5. Lag plakaten

```bash
npm run plakat -- https://kantine.<brukernavn>.workers.dev "Kantina"
```

Det lager `plakat.html` med QR-koden ferdig satt opp. Åpne den i nettleseren og
skriv ut i A4.

## Utvikling lokalt

```bash
npm run db:init      # lager tabellene i en lokal database
npm run db:seed      # legger inn eksempelmenyen
npm run dev          # starter på http://localhost:8787
```

Lokalt leses PIN-kodene fra `.dev.vars` (ikke sjekket inn):

```
ANSATT_PIN=1234
ADMIN_PIN=9999
```

Tester:

```bash
npm test
```

## En vanlig skoledag

**Om morgenen** går læreren inn på `/admin`, setter antall på dagens varer
(«Fyll opp lageret til ny dag») og åpner kantina.

**I friminuttene** står ordretavla på `/kjokken`. Nye bestillinger dukker opp
øverst i venstre kolonne. Ubetalte ordrer har gul stripe. Når eleven har
vippset, trykker dere **Merk betalt**; deretter **Start**, **Klar** og
**Levert** etter hvert som maten blir laget og hentet.

**Ved stengetid** stenger læreren kantina fra `/admin` og ser dagsoppgjøret –
omsetning, hva som ble solgt, og om noe står ubetalt.

Varer som går tomt forsvinner automatisk fra menyen.

## Hvordan det er bygget

Ingen rammeverk og ingen byggesteg. Frontend er vanlig HTML, CSS og JavaScript,
backend er én Cloudflare Worker. Det er et bevisst valg: systemet skal kunne
vedlikeholdes av en lærer eller en elev om noen år, uten at halve
avhengighetstreet har råtnet i mellomtiden.

```
src/
  index.js          rutetabell
  db.js             alle databasespørringer
  auth.js           PIN-innlogging med signert informasjonskapsel
  util.js           kroner, norsk tid, tekstvask
  betaling/         vipps_qr.js og vipps_epayment.js
  ruter/            offentlig.js, ansatt.js, admin.js
public/             sidene elevene og kjøkkenet ser
schema.sql          tabellene
seed.sql            eksempelmeny
```

Noen valg som er verdt å kjenne til:

- **Priser lagres i øre**, som heltall. Aldri desimaltall på penger.
- **Prisene hentes fra databasen** når en bestilling lages. Det klienten sender
  inn av priser blir ignorert.
- **Lagertellingen er atomisk.** To elever som bestiller den siste bollen
  samtidig havner i samme transaksjon, og bare én får den. Dette er testet.
- **Navn og pris kopieres inn i ordrelinjen.** En kvittering skal vise hva varen
  het og kostet da den ble bestilt, selv om menyen endres etterpå.
- **Betalingsstatus er skilt fra kjøkkenstatus.** En ordre kan være laget før
  den er betalt, og betalt før den er laget.
- **Kvitteringssiden nås via en tilfeldig ID**, ikke ordrenummeret. Ellers
  kunne hvem som helst talt seg oppover og lest navnene til alle som hadde
  bestilt.

## Personvern

Systemet lagrer navn, klasse og hva eleven bestilte. Det er det minste som
trengs for å levere riktig mat til riktig person, men det er
personopplysninger om mindreårige, og skolen er behandlingsansvarlig.

To ting bør avklares med skolen før dere setter i gang:

- **Hvor lenge skal bestillingene lagres?** Systemet sletter ingenting
  automatisk i dag. Det enkleste er å tømme gamle ordrer med jevne mellomrom:
  ```bash
  npx wrangler d1 execute kantine --remote \
    --command "DELETE FROM ordrer WHERE dato < date('now', '-30 days')"
  ```
- **Hvem skal ha PIN-kodene?** Alle som har ansatt-PIN ser navnene på alle som
  har bestilt i dag. Bytt kodene når elever slutter i faget – alle
  innlogginger blir automatisk ugyldige når PIN endres.
