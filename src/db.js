import { HttpError, datoIOslo, klokkeslettIOslo, rensTekst } from './util.js';

// Grenser som holder skjemaet og dashbordet lesbart.
const MAKS_LINJER = 20;
const MAKS_ANTALL_PER_VARE = 10;

export async function hentInnstillinger(env) {
  const { results } = await env.DB.prepare('SELECT nokkel, verdi FROM innstillinger').all();
  return Object.fromEntries(results.map((r) => [r.nokkel, r.verdi]));
}

export async function settInnstilling(env, nokkel, verdi) {
  await env.DB.prepare(
    'INSERT INTO innstillinger (nokkel, verdi) VALUES (?, ?) ' +
      'ON CONFLICT(nokkel) DO UPDATE SET verdi = excluded.verdi',
  )
    .bind(nokkel, String(verdi))
    .run();
}

/** Menyen slik elevene ser den: kategorier med varer under. */
export async function hentMeny(env, { inkluderUtilgjengelige = false } = {}) {
  const [kategorier, varer, hentetider] = await Promise.all([
    env.DB.prepare('SELECT id, navn FROM kategorier ORDER BY sortering, id').all(),
    env.DB.prepare(
      `SELECT id, kategori_id, navn, beskrivelse, emoji, pris_ore, tilgjengelig, antall_igjen
         FROM varer
        WHERE arkivert = 0
        ORDER BY sortering, id`,
    ).all(),
    env.DB.prepare('SELECT id, navn, frist FROM hentetider WHERE aktiv = 1 ORDER BY sortering, id').all(),
  ]);

  const synlig = varer.results.filter(
    (v) => inkluderUtilgjengelige || (v.tilgjengelig === 1 && v.antall_igjen !== 0),
  );

  // Et hentetidspunkt hvis frist har gått ut skal ikke kunne velges. Uten
  // dette ville menyen foreslaatt et tidspunkt serveren like etter avviser.
  const naa = klokkeslettIOslo();

  return {
    hentetider: hentetider.results.map((ht) => ({ ...ht, apen: naa <= ht.frist })),
    kategorier: kategorier.results
      .map((k) => ({
        id: k.id,
        navn: k.navn,
        varer: synlig
          .filter((v) => v.kategori_id === k.id)
          .map((v) => ({
            id: v.id,
            navn: v.navn,
            beskrivelse: v.beskrivelse,
            emoji: v.emoji,
            pris_ore: v.pris_ore,
            tilgjengelig: v.tilgjengelig === 1 && v.antall_igjen !== 0,
            antall_igjen: v.antall_igjen,
          })),
      }))
      // Tomme kategorier er bare støy for eleven.
      .filter((k) => inkluderUtilgjengelige || k.varer.length > 0),
  };
}

/**
 * Gjør om det klienten sendte til en liste med varer, priser hentet fra
 * databasen. Prisene i forespørselen ignoreres med vilje - ellers kunne hvem
 * som helst bestilt en baguett til 1 krone.
 */
async function byggLinjer(env, raaLinjer) {
  if (!Array.isArray(raaLinjer) || raaLinjer.length === 0) {
    throw new HttpError(400, 'Handlekurven er tom.');
  }
  if (raaLinjer.length > MAKS_LINJER) {
    throw new HttpError(400, 'For mange ulike varer i én bestilling.');
  }

  // Slaa sammen duplikater, slik at 2 x samme vare blir én linje.
  const antallPerVare = new Map();
  for (const linje of raaLinjer) {
    const vareId = Number(linje?.vare_id);
    const antall = Number(linje?.antall);
    if (!Number.isInteger(vareId) || vareId <= 0) {
      throw new HttpError(400, 'Ugyldig vare i handlekurven.');
    }
    if (!Number.isInteger(antall) || antall <= 0) {
      throw new HttpError(400, 'Ugyldig antall i handlekurven.');
    }
    antallPerVare.set(vareId, (antallPerVare.get(vareId) ?? 0) + antall);
  }

  for (const antall of antallPerVare.values()) {
    if (antall > MAKS_ANTALL_PER_VARE) {
      throw new HttpError(400, `Du kan bestille maks ${MAKS_ANTALL_PER_VARE} av samme vare.`);
    }
  }

  const ider = [...antallPerVare.keys()];
  const plassholdere = ider.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT id, navn, emoji, pris_ore, tilgjengelig, antall_igjen
       FROM varer
      WHERE arkivert = 0 AND id IN (${plassholdere})`,
  )
    .bind(...ider)
    .all();

  const varePerId = new Map(results.map((v) => [v.id, v]));

  const linjer = [];
  for (const [vareId, antall] of antallPerVare) {
    const vare = varePerId.get(vareId);
    if (!vare) throw new HttpError(400, 'En av varene finnes ikke lenger.');
    if (vare.tilgjengelig !== 1) {
      throw new HttpError(409, `${vare.navn} er ikke tilgjengelig akkurat nå.`);
    }
    if (vare.antall_igjen !== null && vare.antall_igjen < antall) {
      throw new HttpError(
        409,
        vare.antall_igjen === 0
          ? `${vare.navn} er dessverre utsolgt.`
          : `Det er bare ${vare.antall_igjen} igjen av ${vare.navn}.`,
      );
    }
    linjer.push({
      vare_id: vare.id,
      navn: vare.navn,
      emoji: vare.emoji,
      pris_ore: vare.pris_ore,
      antall,
      // NULL betyr ubegrenset, og da skal det ikke telles ned.
      tell_ned: vare.antall_igjen !== null,
    });
  }

  return linjer;
}

/**
 * Telefonnummeret er valgfritt. Er det fylt ut, skal det være et norsk
 * mobilnummer - et halvt nummer er verre enn ingenting, siden kjøkkenet da
 * tror de kan nå eleven.
 */
function lesTelefon(verdi) {
  const raa = rensTekst(verdi, 24);
  if (raa === '') return '';

  let siffer = raa.replace(/\D/g, '');
  if (siffer.startsWith('0047')) siffer = siffer.slice(4);
  else if (siffer.length === 10 && siffer.startsWith('47')) siffer = siffer.slice(2);

  if (!/^[49]\d{7}$/.test(siffer)) {
    throw new HttpError(400, 'Telefonnummeret må være åtte siffer, eller stå tomt.');
  }

  return siffer;
}

async function finnHentetid(env, hentetidId) {
  if (hentetidId === null || hentetidId === undefined || hentetidId === '') return null;
  const rad = await env.DB.prepare('SELECT id, navn, frist FROM hentetider WHERE id = ? AND aktiv = 1')
    .bind(Number(hentetidId))
    .first();
  if (!rad) throw new HttpError(400, 'Ugyldig hentetidspunkt.');
  if (klokkeslettIOslo() > rad.frist) {
    throw new HttpError(409, `Fristen for ${rad.navn} har gått ut. Velg et senere tidspunkt.`);
  }
  return rad;
}

/**
 * Oppretter en ordre. Hele operasjonen kjøres som én D1-batch, som er én
 * transaksjon: enten blir bade lagertrekk, ordre og ordrelinjer lagret, eller
 * så blir ingenting lagret.
 */
export async function opprettOrdre(env, input) {
  const innstillinger = await hentInnstillinger(env);
  if (innstillinger.apen !== '1') {
    throw new HttpError(409, innstillinger.stengt_melding || 'Kantina er stengt.');
  }

  const elevNavn = rensTekst(input.elev_navn, 60);
  if (elevNavn.length < 2) {
    throw new HttpError(400, 'Skriv navnet ditt, så vi vet hvem maten er til.');
  }

  const klasse = rensTekst(input.klasse, 20);
  const telefon = lesTelefon(input.telefon);
  const merknad = rensTekst(input.merknad, 200);
  const linjer = await byggLinjer(env, input.linjer);
  const hentetid = await finnHentetid(env, input.hentetid_id);
  const totalOre = linjer.reduce((sum, l) => sum + l.pris_ore * l.antall, 0);
  const dato = datoIOslo();

  // Hentenummeret er unikt per dag. Hvis to bestillinger treffer samme nummer
  // samtidig slår unik-indeksen inn, og vi prover på nytt med neste ledige.
  for (let forsok = 0; forsok < 5; forsok++) {
    const forrige = await env.DB.prepare(
      'SELECT COALESCE(MAX(hentenummer), 0) AS siste FROM ordrer WHERE dato = ?',
    )
      .bind(dato)
      .first();
    const hentenummer = forrige.siste + 1;

    const offentligId = crypto.randomUUID();

    const setninger = [
      env.DB.prepare(
        `INSERT INTO ordrer
           (dato, hentenummer, offentlig_id, elev_navn, klasse, telefon, hentetid_id,
            hentetid_navn, merknad, total_ore, betalingsmetode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        dato,
        hentenummer,
        offentligId,
        elevNavn,
        klasse,
        telefon,
        hentetid?.id ?? null,
        hentetid?.navn ?? '',
        merknad,
        totalOre,
        env.BETALINGSMETODE ?? 'vipps_qr',
      ),
    ];

    for (const linje of linjer) {
      setninger.push(
        env.DB.prepare(
          `INSERT INTO ordrelinjer (ordre_id, vare_id, navn, emoji, pris_ore, antall)
           VALUES ((SELECT id FROM ordrer WHERE dato = ? AND hentenummer = ?), ?, ?, ?, ?, ?)`,
        ).bind(dato, hentenummer, linje.vare_id, linje.navn, linje.emoji, linje.pris_ore, linje.antall),
      );

      if (linje.tell_ned) {
        // Trekkes uten betingelse. Gaar lageret i minus, bryter det CHECKen på
        // kolonnen og hele batchen rulles tilbake.
        setninger.push(
          env.DB.prepare('UPDATE varer SET antall_igjen = antall_igjen - ? WHERE id = ?').bind(
            linje.antall,
            linje.vare_id,
          ),
        );
      }
    }

    try {
      await env.DB.batch(setninger);
    } catch (feil) {
      const melding = String(feil?.message ?? feil);
      if (melding.includes('idx_ordrer_dagsnummer') || melding.includes('UNIQUE')) {
        continue; // Noen andre tok nummeret. Prov igjen.
      }
      if (melding.includes('CHECK')) {
        throw new HttpError(409, 'Noen rakk å bestille før deg – en av varene er utsolgt.');
      }
      throw feil;
    }

    const ordre = await hentOrdre(env, { dato, hentenummer });
    await loggHendelse(env, ordre.id, 'opprettet', `${linjer.length} varelinjer`);
    return ordre;
  }

  throw new HttpError(503, 'Det er mye trafikk akkurat nå. Prøv igjen om et øyeblikk.');
}

/** Henter én ordre med linjer, enten på id eller på dato+hentenummer. */
export async function hentOrdre(env, kriterier) {
  let ordre;
  if (kriterier.id !== undefined) {
    ordre = await env.DB.prepare('SELECT * FROM ordrer WHERE id = ?').bind(Number(kriterier.id)).first();
  } else if (kriterier.offentlig_id !== undefined) {
    ordre = await env.DB.prepare('SELECT * FROM ordrer WHERE offentlig_id = ?')
      .bind(String(kriterier.offentlig_id))
      .first();
  } else {
    ordre = await env.DB.prepare('SELECT * FROM ordrer WHERE dato = ? AND hentenummer = ?')
      .bind(kriterier.dato, kriterier.hentenummer)
      .first();
  }

  if (!ordre) throw new HttpError(404, 'Fant ikke bestillingen.');

  const { results } = await env.DB.prepare(
    // vare_id trengs for å kunne føre varene tilbake på lageret ved avbrudd.
    'SELECT vare_id, navn, emoji, pris_ore, antall FROM ordrelinjer WHERE ordre_id = ? ORDER BY id',
  )
    .bind(ordre.id)
    .all();

  return { ...ordre, linjer: results };
}

/** Ordrene kjøkkenet trenger å se: dagens, nyeste først. */
export async function hentDagensOrdrer(env, { dato = datoIOslo(), inkluderLevert = false } = {}) {
  const statusFilter = inkluderLevert ? '' : "AND status NOT IN ('levert', 'avbrutt')";

  const { results: ordrer } = await env.DB.prepare(
    `SELECT id, hentenummer, elev_navn, klasse, telefon, hentetid_navn, merknad, total_ore,
            status, betalingsstatus, betalingsmetode, opprettet
       FROM ordrer
      WHERE dato = ? ${statusFilter}
      ORDER BY id DESC`,
  )
    .bind(dato)
    .all();

  if (ordrer.length === 0) return [];

  const plassholdere = ordrer.map(() => '?').join(', ');
  const { results: linjer } = await env.DB.prepare(
    `SELECT ordre_id, navn, emoji, antall, pris_ore
       FROM ordrelinjer
      WHERE ordre_id IN (${plassholdere})
      ORDER BY id`,
  )
    .bind(...ordrer.map((o) => o.id))
    .all();

  const linjerPerOrdre = new Map();
  for (const linje of linjer) {
    if (!linjerPerOrdre.has(linje.ordre_id)) linjerPerOrdre.set(linje.ordre_id, []);
    linjerPerOrdre.get(linje.ordre_id).push(linje);
  }

  return ordrer.map((o) => ({ ...o, linjer: linjerPerOrdre.get(o.id) ?? [] }));
}

export async function settOrdreStatus(env, ordreId, status) {
  const gyldige = ['ny', 'under_arbeid', 'klar', 'levert', 'avbrutt'];
  if (!gyldige.includes(status)) throw new HttpError(400, 'Ugyldig status.');

  const resultat = await env.DB.prepare(
    "UPDATE ordrer SET status = ?, oppdatert = datetime('now') WHERE id = ?",
  )
    .bind(status, Number(ordreId))
    .run();

  if (resultat.meta.changes === 0) throw new HttpError(404, 'Fant ikke bestillingen.');
  await loggHendelse(env, ordreId, 'status', status);
}

/**
 * Avbryter en ordre og legger varene tilbake på lageret.
 *
 * Uten tilbakeføringen ville lageret krympet hver gang noen bestilte feil, og
 * varer ville blitt stående som utsolgt uten grunn.
 *
 * Rekkefølgen i batchen er viktig: lagertilbakeføringen sjekker at ordren ikke
 * alt er avbrutt, og kjøres før statusen settes. Dermed blir hele operasjonen
 * idempotent - trykker to personer "Avbryt" samtidig, føres lageret likevel
 * bare tilbake én gang.
 */
export async function avbrytOrdre(env, ordreId) {
  const id = Number(ordreId);
  const ordre = await hentOrdre(env, { id });

  const setninger = [];

  for (const linje of ordre.linjer) {
    if (!linje.vare_id) continue;
    setninger.push(
      env.DB.prepare(
        `UPDATE varer
            SET antall_igjen = antall_igjen + ?
          WHERE id = ?
            AND antall_igjen IS NOT NULL
            AND (SELECT status FROM ordrer WHERE id = ?) != 'avbrutt'`,
      ).bind(linje.antall, linje.vare_id, id),
    );
  }

  setninger.push(
    env.DB.prepare(
      "UPDATE ordrer SET status = 'avbrutt', oppdatert = datetime('now') WHERE id = ?",
    ).bind(id),
  );

  await env.DB.batch(setninger);
  await loggHendelse(env, id, 'avbrutt', `${ordre.linjer.length} varelinjer lagt tilbake`);

  return hentOrdre(env, { id });
}

export async function settBetalingsstatus(env, ordreId, betalingsstatus, referanse = undefined) {
  const gyldige = ['venter', 'betalt', 'feilet', 'refundert'];
  if (!gyldige.includes(betalingsstatus)) throw new HttpError(400, 'Ugyldig betalingsstatus.');

  const betaltTid = betalingsstatus === 'betalt' ? "datetime('now')" : 'betalt_tid';
  const settReferanse = referanse !== undefined ? ', betaling_ref = ?' : '';

  const setning = env.DB.prepare(
    `UPDATE ordrer
        SET betalingsstatus = ?, betalt_tid = ${betaltTid}, oppdatert = datetime('now')
            ${settReferanse}
      WHERE id = ?`,
  );

  const bindinger =
    referanse !== undefined
      ? [betalingsstatus, referanse, Number(ordreId)]
      : [betalingsstatus, Number(ordreId)];

  const resultat = await setning.bind(...bindinger).run();
  if (resultat.meta.changes === 0) throw new HttpError(404, 'Fant ikke bestillingen.');
  await loggHendelse(env, ordreId, 'betaling', betalingsstatus);
}

export async function loggHendelse(env, ordreId, type, detaljer = '') {
  await env.DB.prepare('INSERT INTO hendelser (ordre_id, type, detaljer) VALUES (?, ?, ?)')
    .bind(ordreId ? Number(ordreId) : null, type, detaljer)
    .run();
}

/** Dagsoppgjor: hva ble solgt, og hvor mye kom inn. */
export async function hentDagsrapport(env, dato = datoIOslo()) {
  const [sum, perVare] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS antall_ordrer,
              COALESCE(SUM(total_ore), 0) AS sum_ore,
              COALESCE(SUM(CASE WHEN betalingsstatus = 'betalt' THEN total_ore ELSE 0 END), 0) AS betalt_ore,
              COALESCE(SUM(CASE WHEN betalingsstatus = 'venter' THEN total_ore ELSE 0 END), 0) AS utestaaende_ore
         FROM ordrer
        WHERE dato = ? AND status != 'avbrutt'`,
    )
      .bind(dato)
      .first(),
    env.DB.prepare(
      `SELECT l.navn, SUM(l.antall) AS antall, SUM(l.antall * l.pris_ore) AS sum_ore
         FROM ordrelinjer l
         JOIN ordrer o ON o.id = l.ordre_id
        WHERE o.dato = ? AND o.status != 'avbrutt'
        GROUP BY l.navn
        ORDER BY antall DESC`,
    )
      .bind(dato)
      .all(),
  ]);

  return { dato, ...sum, varer: perVare.results };
}
