import { krevInnlogging } from '../auth.js';
import { hentInnstillinger, hentMeny, settInnstilling } from '../db.js';
import { HttpError, json, lesJson, rensTekst } from '../util.js';

/** Leser og validerer feltene i skjemaet for en vare. */
function lesVare(input) {
  const navn = rensTekst(input.navn, 80);
  if (navn.length < 1) throw new HttpError(400, 'Varen må ha et navn.');

  const kategoriId = Number(input.kategori_id);
  if (!Number.isInteger(kategoriId) || kategoriId <= 0) {
    throw new HttpError(400, 'Velg en kategori.');
  }

  // Prisen kommer inn i kroner fra skjemaet og lagres i ore.
  const kroner = Number(input.pris_kr);
  if (!Number.isFinite(kroner) || kroner < 0 || kroner > 10000) {
    throw new HttpError(400, 'Ugyldig pris.');
  }
  const prisOre = Math.round(kroner * 100);

  let antallIgjen = null;
  if (input.antall_igjen !== null && input.antall_igjen !== undefined && input.antall_igjen !== '') {
    antallIgjen = Number(input.antall_igjen);
    if (!Number.isInteger(antallIgjen) || antallIgjen < 0) {
      throw new HttpError(400, 'Antall må være et helt tall, eller stå tomt for ubegrenset.');
    }
  }

  return {
    navn,
    kategoriId,
    prisOre,
    antallIgjen,
    beskrivelse: rensTekst(input.beskrivelse, 200),
    emoji: rensTekst(input.emoji, 8),
    tilgjengelig: input.tilgjengelig === false ? 0 : 1,
    sortering: Number.isInteger(Number(input.sortering)) ? Number(input.sortering) : 0,
  };
}

export async function hentAdminData(request, env) {
  await krevInnlogging(request, env, 'admin');
  const [meny, innstillinger, kategorier] = await Promise.all([
    hentMeny(env, { inkluderUtilgjengelige: true }),
    hentInnstillinger(env),
    env.DB.prepare('SELECT id, navn, sortering FROM kategorier ORDER BY sortering, id').all(),
  ]);

  return json({
    ...meny,
    alle_kategorier: kategorier.results,
    innstillinger,
    betalingsmetode: env.BETALINGSMETODE ?? 'vipps_qr',
    vippsnummer: env.VIPPSNUMMER ?? '',
  });
}

export async function opprettVare(request, env) {
  await krevInnlogging(request, env, 'admin');
  const v = lesVare(await lesJson(request));

  const resultat = await env.DB.prepare(
    `INSERT INTO varer (kategori_id, navn, beskrivelse, emoji, pris_ore, tilgjengelig, antall_igjen, sortering)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(v.kategoriId, v.navn, v.beskrivelse, v.emoji, v.prisOre, v.tilgjengelig, v.antallIgjen, v.sortering)
    .run();

  return json({ id: resultat.meta.last_row_id }, 201);
}

export async function endreVare(request, env, { vareId }) {
  await krevInnlogging(request, env, 'admin');
  const v = lesVare(await lesJson(request));

  const resultat = await env.DB.prepare(
    `UPDATE varer
        SET kategori_id = ?, navn = ?, beskrivelse = ?, emoji = ?, pris_ore = ?,
            tilgjengelig = ?, antall_igjen = ?, sortering = ?
      WHERE id = ? AND arkivert = 0`,
  )
    .bind(
      v.kategoriId,
      v.navn,
      v.beskrivelse,
      v.emoji,
      v.prisOre,
      v.tilgjengelig,
      v.antallIgjen,
      v.sortering,
      Number(vareId),
    )
    .run();

  if (resultat.meta.changes === 0) throw new HttpError(404, 'Fant ikke varen.');
  return json({ ok: true });
}

/**
 * Varer arkiveres i stedet for å slettes. Gamle ordrelinjer peker hit, og en
 * sletting ville gjort dagsrapporter for tidligere dager ubrukelige.
 */
export async function arkiverVare(request, env, { vareId }) {
  await krevInnlogging(request, env, 'admin');
  const resultat = await env.DB.prepare('UPDATE varer SET arkivert = 1 WHERE id = ?')
    .bind(Number(vareId))
    .run();

  if (resultat.meta.changes === 0) throw new HttpError(404, 'Fant ikke varen.');
  return json({ ok: true });
}

export async function opprettKategori(request, env) {
  await krevInnlogging(request, env, 'admin');
  const input = await lesJson(request);
  const navn = rensTekst(input.navn, 60);
  if (navn.length < 1) throw new HttpError(400, 'Kategorien må ha et navn.');

  const sortering = Number.isInteger(Number(input.sortering)) ? Number(input.sortering) : 0;
  const resultat = await env.DB.prepare('INSERT INTO kategorier (navn, sortering) VALUES (?, ?)')
    .bind(navn, sortering)
    .run();

  return json({ id: resultat.meta.last_row_id }, 201);
}

export async function slettKategori(request, env, { kategoriId }) {
  await krevInnlogging(request, env, 'admin');

  const antall = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM varer WHERE kategori_id = ? AND arkivert = 0',
  )
    .bind(Number(kategoriId))
    .first();

  if (antall.n > 0) {
    throw new HttpError(409, 'Flytt eller fjern varene i kategorien først.');
  }

  await env.DB.prepare('DELETE FROM kategorier WHERE id = ?').bind(Number(kategoriId)).run();
  return json({ ok: true });
}

export async function endreInnstillinger(request, env) {
  await krevInnlogging(request, env, 'admin');
  const input = await lesJson(request);

  const tillatte = {
    apen: (v) => (v ? '1' : '0'),
    stengt_melding: (v) => rensTekst(v, 200),
    velkomsttekst: (v) => rensTekst(v, 200),
  };

  for (const [nokkel, omform] of Object.entries(tillatte)) {
    if (nokkel in input) await settInnstilling(env, nokkel, omform(input[nokkel]));
  }

  return json({ innstillinger: await hentInnstillinger(env) });
}

/**
 * Fyller opp lageret igjen til en ny dag. Varer uten lagerstyring (NULL) røres
 * ikke. Standardverdien er den som står i skjemaet på admin-siden.
 */
export async function nullstillLager(request, env) {
  await krevInnlogging(request, env, 'admin');
  const input = await lesJson(request);
  const antall = Number(input.antall);

  if (!Number.isInteger(antall) || antall < 0) {
    throw new HttpError(400, 'Oppgi hvor mange av hver vare dere har i dag.');
  }

  const resultat = await env.DB.prepare(
    'UPDATE varer SET antall_igjen = ?, tilgjengelig = 1 WHERE arkivert = 0 AND antall_igjen IS NOT NULL',
  )
    .bind(antall)
    .run();

  return json({ oppdatert: resultat.meta.changes });
}

export async function endreHentetider(request, env) {
  await krevInnlogging(request, env, 'admin');
  const input = await lesJson(request);

  if (!Array.isArray(input.hentetider)) {
    throw new HttpError(400, 'Ugyldig liste med hentetider.');
  }

  const setninger = [env.DB.prepare('UPDATE hentetider SET aktiv = 0')];

  for (const [indeks, ht] of input.hentetider.entries()) {
    const navn = rensTekst(ht?.navn, 60);
    const frist = rensTekst(ht?.frist, 5);
    if (!navn) continue;
    if (!/^\d{2}:\d{2}$/.test(frist)) {
      throw new HttpError(400, `Fristen for «${navn}» må skrives som TT:MM.`);
    }

    setninger.push(
      ht?.id
        ? env.DB.prepare(
            'UPDATE hentetider SET navn = ?, frist = ?, sortering = ?, aktiv = 1 WHERE id = ?',
          ).bind(navn, frist, indeks * 10, Number(ht.id))
        : env.DB.prepare(
            'INSERT INTO hentetider (navn, frist, sortering, aktiv) VALUES (?, ?, ?, 1)',
          ).bind(navn, frist, indeks * 10),
    );
  }

  await env.DB.batch(setninger);
  const { results } = await env.DB.prepare(
    'SELECT id, navn, frist FROM hentetider WHERE aktiv = 1 ORDER BY sortering, id',
  ).all();

  return json({ hentetider: results });
}
