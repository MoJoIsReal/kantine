import { HttpError, formaterKr } from '../util.js';

/**
 * Betaling uten API-integrasjon.
 *
 * Eleven far beskjed om å vippse beløpet til kantinas Vippsnummer med
 * hentenummeret som melding. Den som står i luka ser betalingen i Vipps-appen
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

/**
 * Kalles for ordren lagres, slik at en feil i oppsettet ikke etterlater en
 * ordre ingen kan betale.
 */
export function sjekkOppsett(env) {
  if (!(env.VIPPSNUMMER ?? '').trim()) {
    throw new HttpError(
      503,
      'Kantina mangler Vippsnummer i oppsettet. Si fra til den som drifter systemet.',
    );
  }
}

export function startBetaling({ env, ordre }) {
  sjekkOppsett(env);
  const vippsnummer = env.VIPPSNUMMER.trim();

  return {
    type: 'vipps_qr',
    vippsnummer,
    belop_ore: ordre.total_ore,
    belop_tekst: formaterKr(ordre.total_ore),
    // Meldingen knytter innbetalingen til ordren i luka.
    melding: `#${ordre.hentenummer}`,
    // Merk: her lages det bevisst ingen "trykk for å betale"-lenke. Vipps sitt
    // QR-format er deres eget, og en QR med riktig beløp må hentes fra
    // Vippsportalen. Skriv ut kantinas egen Vipps-QR og heng den ved luka -
    // eleven skanner den og taster beløpet som står her.
    instruksjon:
      `Vipps ${formaterKr(ordre.total_ore)} til ${vippsnummer} ` +
      `og skriv «#${ordre.hentenummer}» i meldingsfeltet.`,
  };
}

/**
 * Det finnes ingen kilde å spørre mot uten API-avtale, så statusen blir
 * stående slik dashbordet har satt den.
 */
export async function sjekkStatus({ ordre }) {
  return ordre.betalingsstatus;
}
