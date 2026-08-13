-- Skjema for kantinesystemet (Cloudflare D1 / SQLite).
-- Alle priser lagres som heltall i ore for å unngaa avrundingsfeil.
-- Kjør med: npm run db:init

DROP TABLE IF EXISTS hendelser;
DROP TABLE IF EXISTS ordrelinjer;
DROP TABLE IF EXISTS ordrer;
DROP TABLE IF EXISTS varer;
DROP TABLE IF EXISTS kategorier;
DROP TABLE IF EXISTS hentetider;
DROP TABLE IF EXISTS innstillinger;

-- ---------------------------------------------------------------- meny

CREATE TABLE kategorier (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  navn      TEXT    NOT NULL,
  sortering INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE varer (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kategori_id  INTEGER NOT NULL REFERENCES kategorier(id) ON DELETE CASCADE,
  navn         TEXT    NOT NULL,
  beskrivelse  TEXT    NOT NULL DEFAULT '',
  emoji        TEXT    NOT NULL DEFAULT '',
  pris_ore     INTEGER NOT NULL CHECK (pris_ore >= 0),
  -- 1 = kan bestilles nå. Settes til 0 når noe er utsolgt.
  tilgjengelig INTEGER NOT NULL DEFAULT 1 CHECK (tilgjengelig IN (0, 1)),
  -- NULL = ubegrenset. Ellers antall igjen i dag; telles ned ved bestilling.
  -- CHECKen er det som gjør lagertellingen trygg: to elever som bestiller den
  -- siste bollen samtidig havner i samme transaksjon, og den som taper får
  -- hele bestillingen rullet tilbake i stedet for at lageret går i minus.
  antall_igjen INTEGER CHECK (antall_igjen IS NULL OR antall_igjen >= 0),
  sortering    INTEGER NOT NULL DEFAULT 0,
  arkivert     INTEGER NOT NULL DEFAULT 0 CHECK (arkivert IN (0, 1))
);

CREATE INDEX idx_varer_kategori ON varer(kategori_id, sortering);

-- Når elevene kan hente maten, f.eks. "Storefri 11:05".
CREATE TABLE hentetider (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  navn      TEXT    NOT NULL,
  -- Bestillinger stenger på dette klokkeslettet, format "HH:MM" (norsk tid).
  frist     TEXT    NOT NULL,
  sortering INTEGER NOT NULL DEFAULT 0,
  aktiv     INTEGER NOT NULL DEFAULT 1 CHECK (aktiv IN (0, 1))
);

-- ---------------------------------------------------------------- ordrer

CREATE TABLE ordrer (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Dato i norsk tid, "YYYY-MM-DD". Hentenummer er unikt per dag.
  dato            TEXT    NOT NULL,
  -- Kort nummer eleven oppgir i luka, f.eks. 42.
  hentenummer     INTEGER NOT NULL,
  -- Tilfeldig ID som kvitteringssiden bruker. Uten denne kunne hvem som helst
  -- talt seg oppover i ordre-IDene og lest navnene til alle som har bestilt.
  offentlig_id    TEXT    NOT NULL,
  elev_navn       TEXT    NOT NULL,
  klasse          TEXT    NOT NULL DEFAULT '',
  hentetid_id     INTEGER REFERENCES hentetider(id),
  hentetid_navn   TEXT    NOT NULL DEFAULT '',
  merknad         TEXT    NOT NULL DEFAULT '',
  total_ore       INTEGER NOT NULL CHECK (total_ore >= 0),

  -- Arbeidsflyt på kjøkkenet.
  status          TEXT    NOT NULL DEFAULT 'ny'
                  CHECK (status IN ('ny', 'under_arbeid', 'klar', 'levert', 'avbrutt')),

  -- Betaling holdes bevisst adskilt fra kjokkenstatusen: en ordre kan være
  -- laget for den er betalt, og betalt for den er laget.
  betalingsstatus TEXT    NOT NULL DEFAULT 'venter'
                  CHECK (betalingsstatus IN ('venter', 'betalt', 'feilet', 'refundert')),
  betalingsmetode TEXT    NOT NULL DEFAULT '',
  -- Vipps-referanse (idempotensnokkel) når ePayment er i bruk.
  betaling_ref    TEXT,
  betalt_tid      TEXT,

  opprettet       TEXT    NOT NULL DEFAULT (datetime('now')),
  oppdatert       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_ordrer_dagsnummer ON ordrer(dato, hentenummer);
CREATE UNIQUE INDEX idx_ordrer_offentlig_id ON ordrer(offentlig_id);
CREATE INDEX idx_ordrer_ko ON ordrer(dato, status);
CREATE UNIQUE INDEX idx_ordrer_betaling_ref ON ordrer(betaling_ref) WHERE betaling_ref IS NOT NULL;

-- Navn og pris kopieres inn her med vilje: en kvittering skal vise hva varen
-- het og kostet da den ble bestilt, selv om menyen endres etterpaa.
CREATE TABLE ordrelinjer (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ordre_id  INTEGER NOT NULL REFERENCES ordrer(id) ON DELETE CASCADE,
  vare_id   INTEGER REFERENCES varer(id),
  navn      TEXT    NOT NULL,
  emoji     TEXT    NOT NULL DEFAULT '',
  pris_ore  INTEGER NOT NULL,
  antall    INTEGER NOT NULL CHECK (antall > 0)
);

CREATE INDEX idx_ordrelinjer_ordre ON ordrelinjer(ordre_id);

-- Enkel logg, slik at man kan se hvem som gjorde hva hvis noe blir feil.
CREATE TABLE hendelser (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ordre_id  INTEGER REFERENCES ordrer(id) ON DELETE CASCADE,
  type      TEXT    NOT NULL,
  detaljer  TEXT    NOT NULL DEFAULT '',
  tidspunkt TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_hendelser_ordre ON hendelser(ordre_id);

-- ---------------------------------------------------------------- innstillinger

CREATE TABLE innstillinger (
  nokkel TEXT PRIMARY KEY,
  verdi  TEXT NOT NULL
);

INSERT INTO innstillinger (nokkel, verdi) VALUES
  ('apen', '1'),
  ('stengt_melding', 'Kantina er stengt akkurat nå. Velkommen tilbake i morgen!'),
  ('velkomsttekst', 'Bestill her, betal med Vipps, og hent i luka.'),
  -- Betalingsoppsettet fylles inn fra /admin, ikke fra wrangler.jsonc.
  ('vippsnummer', ''),
  ('vipps_mottaker_navn', ''),
  ('betalingsreferanse', 'KANTINE Ordre:'),
  ('vipps_lenke', '');
