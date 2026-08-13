import { api, ApiFeil, kr, lag, polling, visFeil } from './felles.js';

const el = (id) => document.getElementById(id);

let oppsett = null;
let stoppPolling = null;

// ---------------------------------------------------------------- innlogging

function visInnlogging() {
  el('laster').hidden = true;
  el('topp').hidden = true;
  el('tavle').hidden = true;
  el('innlogging').hidden = false;
  el('pin').focus();
}

async function loggInn() {
  const knapp = el('logg-inn');
  knapp.disabled = true;
  visFeil('feilmelding', '');

  try {
    await api('/api/ansatt/logg-inn', { metode: 'POST', kropp: { pin: el('pin').value } });
    el('pin').value = '';
    el('innlogging').hidden = true;
    await start();
  } catch (feil) {
    visFeil('feilmelding', feil.message);
  } finally {
    knapp.disabled = false;
  }
}

async function loggUt() {
  if (stoppPolling) stoppPolling();
  await api('/api/ansatt/logg-ut', { metode: 'POST' });
  location.reload();
}

// ---------------------------------------------------------------- ordrekort

async function handling(knapp, kall) {
  knapp.disabled = true;
  try {
    await kall();
    await hentOrdrer();
  } catch (feil) {
    visFeil('feilmelding', feil.message);
    knapp.disabled = false;
  }
}

function statusKnapp(ordre) {
  // Neste steg i arbeidsflyten. Én knapp, slik at det går fort i storefri.
  const neste = {
    ny: ['Start', 'under_arbeid'],
    under_arbeid: ['Klar', 'klar'],
    klar: ['Levert', 'levert'],
  }[ordre.status];

  if (!neste) return null;
  const [tekst, nyStatus] = neste;

  return lag('button', {
    klasse: 'knapp knapp--liten',
    type: 'button',
    tekst,
    onclick: (e) =>
      handling(e.currentTarget, () =>
        api(`/api/ansatt/ordrer/${ordre.id}/status`, {
          metode: 'POST',
          kropp: { status: nyStatus },
        }),
      ),
  });
}

function betalingsKnapp(ordre) {
  if (ordre.betalingsstatus === 'betalt') {
    return lag('span', { klasse: 'merke merke--gronn', tekst: `Betalt ${kr(ordre.total_ore)}` });
  }

  // Ved ekte Vipps-integrasjon skal ingen hake av manuelt - da er det Vipps som
  // bestemmer når noe er betalt.
  if (!oppsett.manuell_betaling) {
    return lag('span', { klasse: 'merke merke--gul', tekst: `Venter ${kr(ordre.total_ore)}` });
  }

  return lag('button', {
    klasse: 'knapp knapp--liten knapp--sekundaer',
    type: 'button',
    tekst: `Merk betalt (${kr(ordre.total_ore)})`,
    onclick: (e) =>
      handling(e.currentTarget, () =>
        api(`/api/ansatt/ordrer/${ordre.id}/betaling`, {
          metode: 'POST',
          kropp: { betalingsstatus: 'betalt' },
        }),
      ),
  });
}

function avbrytKnapp(ordre) {
  return lag('button', {
    klasse: 'knapp knapp--liten knapp--fare',
    type: 'button',
    tekst: 'Avbryt',
    onclick: (e) => {
      // Betalte ordrer må refunderes manuelt i Vipps, så det sies tydelig her.
      const advarsel =
        ordre.betalingsstatus === 'betalt'
          ? `\n\nOBS: #${ordre.hentenummer} er betalt med ${kr(ordre.total_ore)}. ` +
            'Pengene må sendes tilbake manuelt i Vipps.'
          : '';

      if (!confirm(`Avbryte bestilling #${ordre.hentenummer} fra ${ordre.elev_navn}?${advarsel}`)) {
        return;
      }

      handling(e.currentTarget, () =>
        api(`/api/ansatt/ordrer/${ordre.id}/avbryt`, { metode: 'POST' }),
      );
    },
  });
}

function tegnOrdre(ordre) {
  const betalt = ordre.betalingsstatus === 'betalt';

  return lag('article', { klasse: `ordre ${betalt ? 'ordre--betalt' : 'ordre--ubetalt'}` }, [
    lag('div', { klasse: 'ordre__topp' }, [
      lag('span', { klasse: 'ordre__nummer', tekst: `#${ordre.hentenummer}` }),
      lag('span', {
        klasse: 'ordre__navn',
        tekst: ordre.klasse ? `${ordre.elev_navn} · ${ordre.klasse}` : ordre.elev_navn,
      }),
    ]),

    ordre.hentetid_navn
      ? lag('div', { klasse: 'hjelpetekst', tekst: ordre.hentetid_navn })
      : null,

    // Klikkbart, så den som står i luka kan ringe rett fra mobilen.
    ordre.telefon
      ? lag('a', {
          klasse: 'ordre__telefon',
          href: `tel:${ordre.telefon}`,
          tekst: ordre.telefon,
        })
      : null,

    lag(
      'div',
      { klasse: 'mellomrom' },
      ordre.linjer.map((linje) =>
        lag('div', { klasse: 'ordre__linje' }, [
          lag('span', { tekst: `${linje.emoji} ${linje.navn}`.trim() }),
          lag('span', { klasse: 'ordre__antall', tekst: `× ${linje.antall}` }),
        ]),
      ),
    ),

    ordre.merknad ? lag('div', { klasse: 'ordre__merknad', tekst: ordre.merknad }) : null,

    lag('div', { klasse: 'ordre__bunn' }, [
      betalingsKnapp(ordre),
      statusKnapp(ordre),
      // Skyves til høyre, så den ikke treffes ved et uhell i storefri.
      lag('div', { klasse: 'ordre__fyll' }),
      avbrytKnapp(ordre),
    ]),
  ]);
}

// ---------------------------------------------------------------- tavle

function tegnTavle(ordrer) {
  const kolonner = { ny: [], under_arbeid: [], klar: [] };
  for (const ordre of ordrer) {
    if (kolonner[ordre.status]) kolonner[ordre.status].push(ordre);
  }

  for (const [status, liste] of Object.entries(kolonner)) {
    // Eldste øverst i hver kolonne: den som bestilte først skal betjenes først.
    const sortert = [...liste].sort((a, b) => a.id - b.id);
    el(`kolonne-${status}`).replaceChildren(...sortert.map(tegnOrdre));
    el(`antall-${status}`).textContent = String(liste.length);
  }

  el('ingen-ordrer').hidden = ordrer.length > 0;

  const ubetalt = ordrer.filter((o) => o.betalingsstatus !== 'betalt');
  const sumUbetalt = ubetalt.reduce((s, o) => s + o.total_ore, 0);
  el('oppsummering').textContent =
    ubetalt.length === 0
      ? `${ordrer.length} aktive bestillinger · alt betalt`
      : `${ordrer.length} aktive · ${ubetalt.length} ubetalt (${kr(sumUbetalt)})`;
}

async function hentOrdrer() {
  const { ordrer } = await api('/api/ansatt/ordrer');
  tegnTavle(ordrer);
  visFeil('feilmelding', '');
}

// ---------------------------------------------------------------- oppstart

async function start() {
  oppsett = await api('/api/ansatt/meg');

  el('tittel').textContent = oppsett.kantine_navn;
  el('laster').hidden = true;
  el('topp').hidden = false;
  el('tavle').hidden = false;

  await hentOrdrer();

  // Tavla skal oppdatere seg selv - den står gjerne på en skjerm i kantina.
  stoppPolling = polling(hentOrdrer, 4000);
}

el('logg-inn').addEventListener('click', loggInn);
el('logg-ut').addEventListener('click', loggUt);
el('pin').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loggInn();
});

start().catch((feil) => {
  if (feil instanceof ApiFeil && feil.status === 401) visInnlogging();
  else {
    el('laster').hidden = true;
    visFeil('feilmelding', feil.message);
  }
});
