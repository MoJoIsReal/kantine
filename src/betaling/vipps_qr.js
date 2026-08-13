import { HttpError, formaterKr, rensTekst } from '../util.js';

/**
 * Betaling uten API-integrasjon.
 *
 * Eleven far beskjed om å vippse beløpet til kantinas Vippsnummer med
 * en referanse som melding. Den som står i luka ser betalingen i Vipps-appen
 * og trykker "Betalt" på ordren i dashbordet.
 *
 * Fordelen er at dette krever null utviklerintegrasjon og har lavest gebyr
 * (Vippsnummer/handlekurv ligger på 1,75 % mot 2,99 % + 1 kr for betaling på
 * nett). Ulempen er at noen må bekrefte betalingen manuelt.
 *
 * Se docs/BETALING.md for avveiningen.
 */
export const navn = 'vipps_qr';

/** Betalingen bekreftes av et menneske, ikke av Vipps. */
export const krevManuellBekreftelse = true;

const STANDARD_REFERANSE = 'KANTINE Ordre:';

/**
 * Henter en verdi som admin kan styre fra dashbordet, med miljøvariabelen som
 * reserve. Slik slipper læreren å redigere wrangler.jsonc og vente på en
 * deploy for å bytte telefonnummer, samtidig som eldre oppsett som har satt
 * verdien i miljøet fortsatt virker.
 */
function verdi(innstillinger, env, nokkel, miljonavn) {
  return String(innstillinger?.[nokkel] ?? '').trim() || String(env?.[miljonavn] ?? '').trim();
}

/**
 * Kalles før ordren lagres, slik at en feil i oppsettet ikke etterlater en
 * ordre ingen kan betale.
 */
export function sjekkOppsett(env, innstillinger) {
  if (!verdi(innstillinger, env, 'vippsnummer', 'VIPPSNUMMER')) {
    throw new HttpError(
      503,
      'Kantina mangler Vippsnummer. Læreren kan legge det inn under Betaling på /admin.',
    );
  }
}

/**
 * Teksten eleven skal lime inn i meldingsfeltet i Vipps, f.eks.
 * "KANTINE Ordre: 42". Prefikset kan endres med BETALINGSREFERANSE.
 */
export function lagReferanse(env, ordre, innstillinger) {
  const prefiks =
    rensTekst(verdi(innstillinger, env, 'betalingsreferanse', 'BETALINGSREFERANSE'), 40) ||
    STANDARD_REFERANSE;
  return `${prefiks} ${ordre.hentenummer}`;
}

/**
 * Lager lenken som åpner Vipps med mottakeren ferdig utfylt.
 *
 * Formatet er Vipps sin personlige QR-kode, som inneholder telefonnummeret i
 * klartekst. Beløpet kan ikke legges inn - det må eleven taste selv. Vipps har
 * ingen støttet måte å forhåndsutfylle beløp på uten ePayment-API-et.
 *
 * To ting det er verdt å vite:
 *
 * 1. Dette virker bare for et vanlig norsk mobilnummer. Et Vippsnummer for
 *    bedrifter er 5-6 siffer, og har ikke denne lenkeformen. Da returnerer vi
 *    null, og kvitteringen viser nummeret i stedet for en knapp.
 * 2. Vipps har varslet at de på sikt går over til QR-koder med token i stedet
 *    for telefonnummer i klartekst. Skjer det, slutter denne lenken å virke,
 *    og da må dere over på ePayment-API-et.
 */
export function lagVippsLenke(vippsnummer) {
  const siffer = String(vippsnummer).replace(/\D/g, '');

  // Godta 93936700, 4793936700 og 004793936700 som samme nummer.
  let nasjonalt = siffer;
  if (nasjonalt.startsWith('0047')) nasjonalt = nasjonalt.slice(4);
  else if (nasjonalt.length === 10 && nasjonalt.startsWith('47')) nasjonalt = nasjonalt.slice(2);

  // Norske mobilnumre er åtte siffer og begynner på 4 eller 9.
  if (!/^[49]\d{7}$/.test(nasjonalt)) return null;

  return `https://qr.vipps.no/28/2/01/031/47${nasjonalt}?v=1`;
}

export function startBetaling({ env, ordre, innstillinger }) {
  sjekkOppsett(env, innstillinger);

  const vippsnummer = verdi(innstillinger, env, 'vippsnummer', 'VIPPSNUMMER');
  const mottakerNavn = rensTekst(
    verdi(innstillinger, env, 'vipps_mottaker_navn', 'VIPPS_MOTTAKER_NAVN'),
    60,
  );
  const referanse = lagReferanse(env, ordre, innstillinger);

  // Overstyring med en adresse hentet fra Vippsportalen. Er den tom, lages
  // lenken fra nummeret.
  const lenke =
    verdi(innstillinger, env, 'vipps_lenke', 'VIPPS_LENKE') || lagVippsLenke(vippsnummer);

  return {
    type: 'vipps_qr',
    vippsnummer,
    mottaker_navn: mottakerNavn,
    belop_ore: ordre.total_ore,
    belop_tekst: formaterKr(ordre.total_ore),
    // Meldingen knytter innbetalingen til ordren i luka.
    referanse,
    vipps_lenke: lenke || null,
    instruksjon:
      `Vipps ${formaterKr(ordre.total_ore)} til ${vippsnummer}` +
      `${mottakerNavn ? ` (${mottakerNavn})` : ''} og skriv «${referanse}» i meldingsfeltet.`,
    // Beløpet kan ikke forhåndsutfylles, så eleven må få klar beskjed om det.
    beloep_maa_tastes: Boolean(lenke),
  };
}

/**
 * Det finnes ingen kilde å spørre mot uten API-avtale, så statusen blir
 * stående slik dashbordet har satt den.
 */
export async function sjekkStatus({ ordre }) {
  return ordre.betalingsstatus;
}
