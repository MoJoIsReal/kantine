import * as admin from './ruter/admin.js';
import * as ansatt from './ruter/ansatt.js';
import * as offentlig from './ruter/offentlig.js';
import { HttpError, json } from './util.js';

/**
 * Rutetabell. Mønsteret er en enkel sti der :navn fanger opp ett ledd, og
 * verdiene havner i tredje argument til handteringsfunksjonen.
 */
const RUTER = [
  ['GET', '/api/meny', offentlig.hentMenySide],
  ['POST', '/api/ordrer', offentlig.lagOrdre],
  ['GET', '/api/ordrer/:offentligId', offentlig.hentOrdreStatus],
  ['POST', '/api/ordrer/:offentligId/betaling', offentlig.hentBetalingsinfo],

  ['POST', '/api/ansatt/logg-inn', ansatt.loggInn],
  ['POST', '/api/ansatt/logg-ut', ansatt.loggUt],
  ['GET', '/api/ansatt/meg', ansatt.hvemErJeg],
  ['GET', '/api/ansatt/ordrer', ansatt.hentKo],
  ['POST', '/api/ansatt/ordrer/:ordreId/status', ansatt.endreStatus],
  ['POST', '/api/ansatt/ordrer/:ordreId/betaling', ansatt.endreBetaling],
  ['POST', '/api/ansatt/ordrer/:ordreId/avbryt', ansatt.avbryt],
  ['GET', '/api/ansatt/rapport', ansatt.hentRapport],

  ['GET', '/api/admin/data', admin.hentAdminData],
  ['POST', '/api/admin/varer', admin.opprettVare],
  ['POST', '/api/admin/varer/:vareId', admin.endreVare],
  ['POST', '/api/admin/varer/:vareId/arkiver', admin.arkiverVare],
  ['POST', '/api/admin/kategorier', admin.opprettKategori],
  ['POST', '/api/admin/kategorier/:kategoriId/slett', admin.slettKategori],
  ['POST', '/api/admin/innstillinger', admin.endreInnstillinger],
  ['POST', '/api/admin/lager/nullstill', admin.nullstillLager],
  ['POST', '/api/admin/hentetider', admin.endreHentetider],
];

function finnRute(metode, sti) {
  const deler = sti.split('/').filter(Boolean);

  for (const [ruteMetode, mønster, handter] of RUTER) {
    const monsterDeler = mønster.split('/').filter(Boolean);
    if (monsterDeler.length !== deler.length) continue;

    const parametere = {};
    let treff = true;

    for (let i = 0; i < monsterDeler.length; i++) {
      const del = monsterDeler[i];
      if (del.startsWith(':')) {
        parametere[del.slice(1)] = decodeURIComponent(deler[i]);
      } else if (del !== deler[i]) {
        treff = false;
        break;
      }
    }

    if (!treff) continue;
    // Stien stemmer. Feil metode er da 405, ikke 404.
    if (ruteMetode !== metode) return { feilMetode: true };
    return { handter, parametere };
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Alt som ikke er /api havner her bare hvis det ikke fantes som fil i
    // ./public. Da er det en ukjent side.
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Fant ikke siden.', { status: 404 });
    }

    const rute = finnRute(request.method, url.pathname);
    if (!rute) return json({ feil: 'Ukjent endepunkt.' }, 404);
    if (rute.feilMetode) return json({ feil: 'Metoden støttes ikke her.' }, 405);

    try {
      return await rute.handter(request, env, rute.parametere, ctx);
    } catch (feil) {
      if (feil instanceof HttpError) {
        return json({ feil: feil.message }, feil.status);
      }
      // Uventede feil logges i sin helhet, men brukeren far en nokternt formulert
      // melding uten tekniske detaljer.
      console.error('Uventet feil', feil);
      return json({ feil: 'Noe gikk galt. Prøv igjen.' }, 500);
    }
  },
};
