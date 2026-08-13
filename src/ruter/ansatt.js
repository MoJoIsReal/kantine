import { krevInnlogging, lagToken, rolleForPin, settOktCookie, slettOktCookie } from '../auth.js';
import { velgDriver } from '../betaling/index.js';
import {
  hentDagensOrdrer,
  hentDagsrapport,
  hentOrdre,
  settBetalingsstatus,
  settOrdreStatus,
} from '../db.js';
import { HttpError, json, lesJson } from '../util.js';

export async function loggInn(request, env) {
  if (!env.ANSATT_PIN && !env.ADMIN_PIN) {
    throw new HttpError(
      500,
      'Systemet mangler PIN-koder. Kjør `npx wrangler secret put ANSATT_PIN` og `ADMIN_PIN`.',
    );
  }

  const { pin } = await lesJson(request);
  const rolle = rolleForPin(env, pin);

  if (!rolle) {
    // Liten forsinkelse gjør det upraktisk å prove seg fram på en firesifret PIN.
    await new Promise((r) => setTimeout(r, 700));
    throw new HttpError(401, 'Feil PIN.');
  }

  const token = await lagToken(env, rolle);
  return json({ rolle }, 200, { 'set-cookie': settOktCookie(token) });
}

export async function loggUt() {
  return json({ ok: true }, 200, { 'set-cookie': slettOktCookie() });
}

export async function hvemErJeg(request, env) {
  const okt = await krevInnlogging(request, env);
  return json({
    rolle: okt.rolle,
    kantine_navn: env.KANTINE_NAVN ?? 'Kantina',
    betalingsmetode: env.BETALINGSMETODE ?? 'vipps_qr',
    manuell_betaling: velgDriver(env).krevManuellBekreftelse,
  });
}

export async function hentKo(request, env) {
  await krevInnlogging(request, env);
  const url = new URL(request.url);
  const ordrer = await hentDagensOrdrer(env, {
    inkluderLevert: url.searchParams.get('alle') === '1',
  });
  return json({ ordrer });
}

export async function endreStatus(request, env, { ordreId }) {
  await krevInnlogging(request, env);
  const { status } = await lesJson(request);
  await settOrdreStatus(env, ordreId, status);
  const ordre = await hentOrdre(env, { id: ordreId });
  return json({ ordre });
}

/**
 * Brukes når betalingen bekreftes manuelt: den som står i luka ser
 * innbetalingen i Vipps-appen og trykker "Betalt".
 */
export async function endreBetaling(request, env, { ordreId }) {
  await krevInnlogging(request, env);
  const { betalingsstatus } = await lesJson(request);

  // Refusjon over API-et er bevisst ikke stottet: pengene må uansett sendes
  // tilbake manuelt i Vipps, og da skal ikke systemet paastaa noe annet.
  if (betalingsstatus === 'refundert') {
    throw new HttpError(400, 'Refusjon gjøres i Vipps. Sett ordren til «avbrutt» her.');
  }

  await settBetalingsstatus(env, ordreId, betalingsstatus);
  const ordre = await hentOrdre(env, { id: ordreId });
  return json({ ordre });
}

export async function hentRapport(request, env) {
  await krevInnlogging(request, env);
  const url = new URL(request.url);
  const dato = url.searchParams.get('dato') ?? undefined;
  return json(await hentDagsrapport(env, dato));
}
