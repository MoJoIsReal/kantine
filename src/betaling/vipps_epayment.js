import { HttpError } from '../util.js';

/**
 * Full integrasjon mot Vipps ePayment API.
 *
 * Eleven trykker "Betal", Vipps-appen åpner seg med riktig beløp, og ordren
 * merkes betalt av seg selv. Krever en ekte bedriftsavtale med Vipps og
 * API-nøkler fra Vippsportalen, og koster mer i gebyr enn Vippsnummer.
 *
 * Slås på ved å sette BETALINGSMETODE = "vipps_epayment" i wrangler.jsonc.
 */
export const navn = 'vipps_epayment';

export const krevManuellBekreftelse = false;

// Domenene apitest.vipps.no / api.vipps.no er de som brukes i Vipps sin egen
// dokumentasjon. apitest.vippsmobilepay.com / api.vippsmobilepay.com peker samme
// sted om dere heller vil bruke det nye navnet.
function basisUrl(env) {
  return env.VIPPS_MILJO === 'produksjon' ? 'https://api.vipps.no' : 'https://apitest.vipps.no';
}

/**
 * Kalles for ordren lagres, slik at en feil i oppsettet ikke etterlater en
 * ordre ingen kan betale.
 */
export function sjekkOppsett(env) {
  const manglende = [
    'VIPPS_CLIENT_ID',
    'VIPPS_CLIENT_SECRET',
    'VIPPS_SUBSCRIPTION_KEY',
    'VIPPS_MSN',
  ].filter((n) => !env[n]);

  if (manglende.length > 0) {
    throw new HttpError(
      500,
      `Vipps-oppsettet er ikke fullført (mangler ${manglende.join(', ')}). ` +
        'Si fra til den som drifter systemet.',
    );
  }
}

/**
 * Headere Vipps ber om på alle kall. Vipps-System-* brukes av dem til
 * feilsøking og statistikk, og er anbefalt praksis.
 */
function standardHeadere(env) {
  return {
    'Ocp-Apim-Subscription-Key': env.VIPPS_SUBSCRIPTION_KEY,
    'Merchant-Serial-Number': env.VIPPS_MSN,
    'Vipps-System-Name': 'kantine',
    'Vipps-System-Version': '1.0.0',
  };
}

/**
 * Henter et access token. Tokenet varer i ca. en time, men Workers har ingen
 * delt hukommelse mellom forespørsler, så vi henter et nytt hver gang.
 * Ordremengden i en skolekantine gjør det helt uproblematisk.
 */
async function hentToken(env) {
  const svar = await fetch(`${basisUrl(env)}/accesstoken/get`, {
    method: 'POST',
    headers: {
      client_id: env.VIPPS_CLIENT_ID,
      client_secret: env.VIPPS_CLIENT_SECRET,
      ...standardHeadere(env),
    },
  });

  if (!svar.ok) {
    console.error('Vipps accesstoken feilet', svar.status, await svar.text());
    throw new HttpError(502, 'Får ikke kontakt med Vipps akkurat nå. Prøv igjen om litt.');
  }

  const data = await svar.json();
  return data.access_token;
}

async function vippsKall(env, sti, { metode = 'GET', kropp, idempotensNokkel } = {}) {
  const token = await hentToken(env);

  const headere = {
    Authorization: `Bearer ${token}`,
    ...standardHeadere(env),
  };
  if (kropp) headere['content-type'] = 'application/json';
  // Beskytter mot dobbel belastning hvis et kall blir sendt to ganger.
  if (idempotensNokkel) headere['Idempotency-Key'] = idempotensNokkel;

  const svar = await fetch(`${basisUrl(env)}${sti}`, {
    method: metode,
    headers: headere,
    body: kropp ? JSON.stringify(kropp) : undefined,
  });

  const tekst = await svar.text();
  if (!svar.ok) {
    console.error('Vipps-kall feilet', metode, sti, svar.status, tekst);
    throw new HttpError(502, 'Betalingen kunne ikke startes. Prøv igjen om litt.');
  }

  return tekst ? JSON.parse(tekst) : {};
}

/**
 * Oppretter en betaling og returnerer URLen eleven skal sendes til.
 * Vipps-appen åpner seg der, med beløpet ferdig utfylt.
 */
export async function startBetaling({ env, ordre, opprinnelse }) {
  sjekkOppsett(env);

  // Referansen må være unik per betaling og er nokkelen vi slår opp på
  // senere. Vipps krever 8-50 tegn.
  const referanse = `kantine-${ordre.dato}-${ordre.id}`;

  const svar = await vippsKall(env, '/epayment/v1/payments', {
    metode: 'POST',
    idempotensNokkel: referanse,
    kropp: {
      amount: { currency: 'NOK', value: ordre.total_ore },
      paymentMethod: { type: 'WALLET' },
      reference: referanse,
      userFlow: 'WEB_REDIRECT',
      // Må være den offentlige IDen - kvitteringssiden slår opp på den.
      returnUrl: `${opprinnelse}/kvittering?ordre=${ordre.offentlig_id}`,
      paymentDescription: `Kantina – bestilling #${ordre.hentenummer}`,
      // Eleven står med telefonen i hånden og godkjenner selv.
      customerInteraction: 'CUSTOMER_PRESENT',
    },
  });

  return {
    type: 'vipps_epayment',
    referanse,
    redirect_url: svar.redirectUrl,
    instruksjon: 'Du sendes videre til Vipps for å betale.',
  };
}

/**
 * Spør Vipps om hvordan det gikk, og trekker pengene når betalingen er
 * godkjent. Vipps reserverer beløpet ved godkjenning; det er først ved capture
 * pengene faktisk flyttes.
 */
export async function sjekkStatus({ env, ordre }) {
  if (!ordre.betaling_ref) return 'venter';
  sjekkOppsett(env);

  const betaling = await vippsKall(env, `/epayment/v1/payments/${ordre.betaling_ref}`);
  const tilstand = betaling.state;

  if (tilstand === 'AUTHORIZED') {
    // Alt er reservert; hent pengene. Kantina leverer varen med en gang, så
    // det er riktig å trekke umiddelbart.
    const alleredeTrukket = betaling.aggregate?.capturedAmount?.value ?? 0;
    if (alleredeTrukket < ordre.total_ore) {
      await vippsKall(env, `/epayment/v1/payments/${ordre.betaling_ref}/capture`, {
        metode: 'POST',
        idempotensNokkel: `capture-${ordre.betaling_ref}`,
        kropp: { modificationAmount: { currency: 'NOK', value: ordre.total_ore } },
      });
    }
    return 'betalt';
  }

  if (tilstand === 'TERMINATED' || tilstand === 'ABORTED' || tilstand === 'EXPIRED') {
    return 'feilet';
  }

  // CREATED - eleven har ikke fullført enda.
  return 'venter';
}
