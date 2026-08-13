import { velgDriver } from '../betaling/index.js';
import {
  hentInnstillinger,
  hentMeny,
  hentOrdre,
  opprettOrdre,
  settBetalingsstatus,
} from '../db.js';
import { HttpError, json, lesJson } from '../util.js';

/** Det eleven far se om en ordre. Navn på andre elever holdes utenfor. */
function offentligOrdre(ordre, driver) {
  return {
    offentlig_id: ordre.offentlig_id,
    hentenummer: ordre.hentenummer,
    elev_navn: ordre.elev_navn,
    hentetid_navn: ordre.hentetid_navn,
    merknad: ordre.merknad,
    total_ore: ordre.total_ore,
    status: ordre.status,
    betalingsstatus: ordre.betalingsstatus,
    // Sier til kvitteringssiden om den skal vise "vis dette i luka" eller vente
    // på at Vipps bekrefter av seg selv.
    manuell_betaling: driver.krevManuellBekreftelse,
    linjer: ordre.linjer,
  };
}

export async function hentMenySide(request, env) {
  const [meny, innstillinger] = await Promise.all([hentMeny(env), hentInnstillinger(env)]);

  return json({
    kantine_navn: env.KANTINE_NAVN ?? 'Kantina',
    apen: innstillinger.apen === '1',
    stengt_melding: innstillinger.stengt_melding ?? '',
    velkomsttekst: innstillinger.velkomsttekst ?? '',
    ...meny,
  });
}

export async function lagOrdre(request, env) {
  const input = await lesJson(request);
  const driver = velgDriver(env);
  const innstillinger = await hentInnstillinger(env);

  // Sjekkes før ordren lagres. Ellers ville et halvferdig betalingsoppsett
  // fylt databasen med ordrer ingen kan betale for.
  driver.sjekkOppsett(env, innstillinger);

  const ordre = await opprettOrdre(env, input);

  let betaling;
  try {
    betaling = await driver.startBetaling({
      env,
      ordre,
      innstillinger,
      opprinnelse: new URL(request.url).origin,
    });
  } catch (feil) {
    // Ordren er allerede lagret. Vi lar den stå som ubetalt i stedet for å
    // slette den, slik at kjøkkenet ser at noe gikk galt og kan rydde opp.
    console.error('Kunne ikke starte betaling', feil);
    throw feil;
  }

  if (betaling.referanse) {
    await settBetalingsstatus(env, ordre.id, 'venter', betaling.referanse);
  }

  return json({ ordre: offentligOrdre(ordre, driver), betaling }, 201);
}

export async function hentOrdreStatus(request, env, { offentligId }) {
  const ordre = await hentOrdre(env, { offentlig_id: offentligId });
  const driver = velgDriver(env);

  // Ved ekte Vipps-integrasjon spør vi Vipps om betalingen har gått gjennom
  // mens eleven ser på kvitteringen.
  if (!driver.krevManuellBekreftelse && ordre.betalingsstatus === 'venter' && ordre.betaling_ref) {
    try {
      const ny = await driver.sjekkStatus({ env, ordre });
      if (ny !== ordre.betalingsstatus) {
        await settBetalingsstatus(env, ordre.id, ny);
        ordre.betalingsstatus = ny;
      }
    } catch (feil) {
      // En feil mot Vipps skal ikke gjøre kvitteringen utilgjengelig.
      console.error('Statussjekk mot Vipps feilet', feil);
    }
  }

  return json({ ordre: offentligOrdre(ordre, driver) });
}

export async function hentBetalingsinfo(request, env, { offentligId }) {
  const ordre = await hentOrdre(env, { offentlig_id: offentligId });
  if (ordre.betalingsstatus === 'betalt') {
    throw new HttpError(409, 'Denne bestillingen er allerede betalt.');
  }

  const driver = velgDriver(env);
  const betaling = await driver.startBetaling({
    env,
    ordre,
    innstillinger: await hentInnstillinger(env),
    opprinnelse: new URL(request.url).origin,
  });

  return json({ betaling });
}
