import { api, ApiFeil, fyll, kr, lag, visFeil } from './felles.js';

const el = (id) => document.getElementById(id);

let data = null;
let redigererVareId = null;

function visOk(melding) {
  const boks = el('okmelding');
  boks.textContent = melding;
  boks.hidden = false;
  setTimeout(() => {
    boks.hidden = true;
  }, 2500);
}

/** Kjører et API-kall, viser feil, og laster inn dataene på nytt når det gikk bra. */
async function utfor(kall, kvittering) {
  visFeil('feilmelding', '');
  try {
    await kall();
    await last();
    if (kvittering) visOk(kvittering);
  } catch (feil) {
    visFeil('feilmelding', feil.message);
  }
}

// ---------------------------------------------------------------- innlogging

function visInnlogging() {
  el('laster').hidden = true;
  el('topp').hidden = true;
  el('panel').hidden = true;
  el('innlogging').hidden = false;
  el('pin').focus();
}

async function loggInn() {
  visFeil('feilmelding', '');
  try {
    await api('/api/ansatt/logg-inn', { metode: 'POST', kropp: { pin: el('pin').value } });
    el('pin').value = '';
    el('innlogging').hidden = true;
    await start();
  } catch (feil) {
    visFeil('feilmelding', feil.message);
  }
}

// ---------------------------------------------------------------- meny

function tegnVarer() {
  const beholder = el('varer');
  beholder.replaceChildren();

  // En vare må høre til en kategori. Uten kategorier fører "Ny vare" bare til
  // en dialog man ikke kan lagre, så da sier vi hva som må gjøres først.
  const manglerKategorier = data.alle_kategorier.length === 0;
  el('ny-vare').disabled = manglerKategorier;

  const alleVarer = data.kategorier.flatMap((k) =>
    k.varer.map((v) => ({ ...v, kategori_navn: k.navn })),
  );

  if (manglerKategorier) {
    beholder.append(
      lag('div', { klasse: 'melding melding--info' }, [
        lag('strong', { tekst: 'Lag en kategori først.' }),
        lag('div', {
          tekst:
            'Varer må ligge i en kategori – for eksempel «Baguetter», «Varmmat» ' +
            'eller «Drikke». Legg til den første nederst på siden, så kan du ' +
            'begynne å fylle inn varer.',
        }),
      ]),
    );
    return;
  }

  if (alleVarer.length === 0) {
    beholder.append(lag('div', { klasse: 'hjelpetekst', tekst: 'Ingen varer ennå.' }));
    return;
  }

  for (const kategori of data.kategorier) {
    if (kategori.varer.length === 0) continue;

    beholder.append(lag('div', { klasse: 'kategori__navn mellomrom', tekst: kategori.navn }));

    for (const vare of kategori.varer) {
      const lagertekst =
        vare.antall_igjen === null ? 'ubegrenset' : `${vare.antall_igjen} igjen`;

      beholder.append(
        lag('div', { klasse: 'varerad' }, [
          lag('div', {}, [
            lag('div', {
              klasse: 'varerad__navn',
              tekst: `${vare.emoji} ${vare.navn}`.trim(),
            }),
            lag('div', {
              klasse: 'hjelpetekst',
              tekst: `${kr(vare.pris_ore)} · ${lagertekst}${vare.tilgjengelig ? '' : ' · skjult'}`,
            }),
          ]),

          lag('button', {
            klasse: 'knapp knapp--liten knapp--sekundaer',
            type: 'button',
            tekst: 'Endre',
            onclick: () => aapneVareDialog(vare, kategori.id),
          }),

          lag('button', {
            klasse: 'knapp knapp--liten knapp--sekundaer',
            type: 'button',
            tekst: 'Fjern',
            onclick: () => {
              if (!confirm(`Fjerne «${vare.navn}» fra menyen?`)) return;
              utfor(
                () => api(`/api/admin/varer/${vare.id}/arkiver`, { metode: 'POST' }),
                'Varen er fjernet.',
              );
            },
          }),
        ]),
      );
    }
  }
}

function aapneVareDialog(vare, kategoriId) {
  // Skal ikke kunne skje - knappen er slått av - men uten kategori er dialogen
  // en blindvei, så vi stopper den her også.
  if (data.alle_kategorier.length === 0) {
    visFeil('feilmelding', 'Lag en kategori før du legger inn varer.');
    return;
  }

  redigererVareId = vare?.id ?? null;

  el('dialog-tittel').textContent = vare ? 'Endre vare' : 'Ny vare';
  el('v-navn').value = vare?.navn ?? '';
  el('v-beskrivelse').value = vare?.beskrivelse ?? '';
  el('v-pris').value = vare ? (vare.pris_ore / 100).toString() : '';
  el('v-antall').value = vare?.antall_igjen ?? '';
  el('v-emoji').value = vare?.emoji ?? '';

  el('v-kategori').replaceChildren(
    ...data.alle_kategorier.map((k) => lag('option', { value: k.id, tekst: k.navn })),
  );
  el('v-kategori').value = kategoriId ?? data.alle_kategorier[0]?.id ?? '';

  el('vare-dialog').showModal();
}

async function lagreVare() {
  const kropp = {
    navn: el('v-navn').value,
    beskrivelse: el('v-beskrivelse').value,
    emoji: el('v-emoji').value,
    kategori_id: el('v-kategori').value,
    pris_kr: el('v-pris').value,
    antall_igjen: el('v-antall').value === '' ? null : el('v-antall').value,
  };

  const sti = redigererVareId ? `/api/admin/varer/${redigererVareId}` : '/api/admin/varer';

  visFeil('feilmelding', '');
  try {
    await api(sti, { metode: 'POST', kropp });
    el('vare-dialog').close();
    await last();
    visOk('Varen er lagret.');
  } catch (feil) {
    // Feilen vises i dialogen sitt sted - alert er enklest når dialogen er modal.
    alert(feil.message);
  }
}

// ---------------------------------------------------------------- kategorier

function tegnKategorier() {
  el('kategorier').replaceChildren(
    ...data.alle_kategorier.map((kategori) =>
      lag('div', { klasse: 'varerad' }, [
        lag('div', { klasse: 'varerad__navn', tekst: kategori.navn }),
        lag('span', {}),
        lag('button', {
          klasse: 'knapp knapp--liten knapp--sekundaer',
          type: 'button',
          tekst: 'Slett',
          onclick: () => {
            if (!confirm(`Slette kategorien «${kategori.navn}»?`)) return;
            utfor(
              () => api(`/api/admin/kategorier/${kategori.id}/slett`, { metode: 'POST' }),
              'Kategorien er slettet.',
            );
          },
        }),
      ]),
    ),
  );
}

// ---------------------------------------------------------------- hentetider

function leggTilHentetidRad(hentetid) {
  el('hentetider').append(
    lag('div', { klasse: 'rad', 'data-hentetid': hentetid?.id ?? '' }, [
      lag('input', {
        type: 'text',
        value: hentetid?.navn ?? '',
        placeholder: 'F.eks. Storefri 11:05',
        maxlength: 60,
        style: 'flex: 1',
        'data-felt': 'navn',
      }),
      lag('input', {
        type: 'time',
        value: hentetid?.frist ?? '',
        style: 'width: 130px',
        'data-felt': 'frist',
        'aria-label': 'Bestillingsfrist',
      }),
      lag('button', {
        klasse: 'knapp knapp--liten knapp--sekundaer',
        type: 'button',
        tekst: 'Fjern',
        onclick: (e) => e.currentTarget.parentElement.remove(),
      }),
    ]),
  );
}

function tegnHentetider() {
  el('hentetider').replaceChildren();
  for (const ht of data.hentetider) leggTilHentetidRad(ht);
}

function lagreHentetider() {
  const rader = [...el('hentetider').querySelectorAll('[data-hentetid]')];

  const hentetider = rader
    .map((rad) => ({
      id: rad.dataset.hentetid || null,
      navn: rad.querySelector('[data-felt="navn"]').value,
      frist: rad.querySelector('[data-felt="frist"]').value,
    }))
    .filter((ht) => ht.navn.trim() !== '');

  utfor(
    () => api('/api/admin/hentetider', { metode: 'POST', kropp: { hentetider } }),
    'Hentetidene er lagret.',
  );
}

// ---------------------------------------------------------------- rapport

async function tegnRapport() {
  const rapport = await api('/api/ansatt/rapport');

  const rader = [
    ['Bestillinger', String(rapport.antall_ordrer)],
    ['Omsetning', kr(rapport.sum_ore)],
    ['Betalt', kr(rapport.betalt_ore)],
    ['Utestående', kr(rapport.utestaaende_ore)],
  ];

  fyll(el('rapport'),
    ...rader.map(([navn, verdi]) =>
      lag('div', { klasse: 'tabellsum' }, [
        lag('span', { tekst: navn }),
        lag('strong', { tekst: verdi }),
      ]),
    ),

    rapport.varer.length > 0
      ? lag('div', { klasse: 'kategori__navn mellomrom', tekst: 'Solgt i dag' })
      : null,

    ...rapport.varer.map((v) =>
      lag('div', { klasse: 'tabellsum' }, [
        lag('span', { tekst: v.navn }),
        lag('span', { tekst: `${v.antall} stk · ${kr(v.sum_ore)}` }),
      ]),
    ),
  );
}

// ---------------------------------------------------------------- betalingsinfo

/** Effektiv verdi: det som står i innstillingene, ellers wrangler.jsonc. */
function betalingsverdi(nokkel) {
  return (data.innstillinger[nokkel] ?? '').trim() || (data.fra_miljo?.[nokkel] ?? '');
}

function tegnBetalingsinfo() {
  const erManuell = data.betalingsmetode !== 'vipps_epayment';
  const nummer = betalingsverdi('vippsnummer');

  fyll(
    el('betalingsinfo'),
    lag('div', { klasse: 'tabellsum' }, [
      lag('span', { tekst: 'Metode' }),
      lag('strong', {
        tekst: erManuell ? 'Vipps-nummer (manuell bekreftelse)' : 'Vipps ePayment (automatisk)',
      }),
    ]),

    !erManuell
      ? lag('div', {
          klasse: 'hjelpetekst mellomrom',
          tekst: 'Vipps bekrefter betalingene automatisk. Ingen avhuking på kjøkkenet.',
        })
      : !nummer
        ? lag('div', {
            klasse: 'melding melding--info mellomrom',
            tekst:
              'Kantina mangler Vippsnummer. Elevene får ikke bestilt før det er ' +
              'lagt inn her.',
          })
        : null,
  );

  // Skjemaet gjelder bare den manuelle varianten. Ved ePayment styres alt av
  // API-nøklene, som er hemmeligheter og ikke hører hjemme i et nettskjema.
  el('betalingsskjema').hidden = !erManuell;
  if (!erManuell) return;

  el('b-vippsnummer').value = nummer;
  el('b-mottaker').value = betalingsverdi('vipps_mottaker_navn');
  el('b-referanse').value = betalingsverdi('betalingsreferanse');

  const lenke = nummer ? lagVippsLenke(nummer) : null;
  el('b-vippsnummer-hjelp').textContent = !nummer
    ? 'Mobilnummer (8 siffer) gir elevene en «Betal med Vipps»-knapp. Bedriftsnummer (5–6 siffer) gjør ikke det.'
    : lenke
      ? 'Mobilnummer – elevene får en «Betal med Vipps»-knapp som åpner appen med mottaker utfylt.'
      : 'Bedriftsnummer – elevene ser nummeret, men får ingen knapp. Vipps støtter ikke lenker til bedriftsnummer.';

  const prefiks = betalingsverdi('betalingsreferanse') || 'KANTINE Ordre:';
  el('b-referanse-eksempel').textContent = `Elevene ser: «${prefiks} 42». Hentenummeret legges på automatisk.`;
}

/**
 * Samme regel som på serveren, brukt her bare for å vise riktig hjelpetekst
 * med en gang. Serveren er fasit.
 */
function lagVippsLenke(vippsnummer) {
  let siffer = String(vippsnummer).replace(/\D/g, '');
  if (siffer.startsWith('0047')) siffer = siffer.slice(4);
  else if (siffer.length === 10 && siffer.startsWith('47')) siffer = siffer.slice(2);
  return /^[49]\d{7}$/.test(siffer) ? `https://qr.vipps.no/28/2/01/031/47${siffer}?v=1` : null;
}

// ---------------------------------------------------------------- innstillinger

function tegnInnstillinger() {
  const apen = data.innstillinger.apen === '1';

  el('apen-knapp').textContent = apen ? 'Steng kantina' : 'Åpne kantina';
  el('apen-status').textContent = apen ? 'Elevene kan bestille nå.' : 'Bestilling er stengt.';
  el('velkomsttekst').value = data.innstillinger.velkomsttekst ?? '';
  el('stengt-melding').value = data.innstillinger.stengt_melding ?? '';
}

// ---------------------------------------------------------------- oppstart

async function last() {
  data = await api('/api/admin/data');
  tegnInnstillinger();
  tegnVarer();
  tegnKategorier();
  tegnHentetider();
  tegnBetalingsinfo();
  await tegnRapport();
}

async function start() {
  await last();
  el('laster').hidden = true;
  el('topp').hidden = false;
  el('panel').hidden = false;
}

// ---------------------------------------------------------------- hendelser

el('logg-inn').addEventListener('click', loggInn);
el('pin').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loggInn();
});

el('logg-ut').addEventListener('click', async () => {
  await api('/api/ansatt/logg-ut', { metode: 'POST' });
  location.reload();
});

el('apen-knapp').addEventListener('click', () =>
  utfor(() =>
    api('/api/admin/innstillinger', {
      metode: 'POST',
      kropp: { apen: data.innstillinger.apen !== '1' },
    }),
  ),
);

el('lagre-tekster').addEventListener('click', () =>
  utfor(
    () =>
      api('/api/admin/innstillinger', {
        metode: 'POST',
        kropp: {
          velkomsttekst: el('velkomsttekst').value,
          stengt_melding: el('stengt-melding').value,
        },
      }),
    'Tekstene er lagret.',
  ),
);

el('ny-vare').addEventListener('click', () => aapneVareDialog(null, null));
el('dialog-lagre').addEventListener('click', lagreVare);
el('dialog-avbryt').addEventListener('click', () => el('vare-dialog').close());

el('legg-til-kategori').addEventListener('click', () => {
  const navn = el('ny-kategori').value.trim();
  if (!navn) return;
  el('ny-kategori').value = '';
  utfor(
    () =>
      api('/api/admin/kategorier', {
        metode: 'POST',
        kropp: { navn, sortering: (data.alle_kategorier.length + 1) * 10 },
      }),
    'Kategorien er lagt til.',
  );
});

el('nullstill').addEventListener('click', () => {
  const antall = Number(el('nullstill-antall').value);
  if (!confirm(`Sette antall til ${antall} på alle varer med lagerstyring?`)) return;
  utfor(
    () => api('/api/admin/lager/nullstill', { metode: 'POST', kropp: { antall } }),
    'Lageret er fylt opp.',
  );
});

el('lagre-betaling').addEventListener('click', () =>
  utfor(
    () =>
      api('/api/admin/innstillinger', {
        metode: 'POST',
        kropp: {
          vippsnummer: el('b-vippsnummer').value,
          vipps_mottaker_navn: el('b-mottaker').value,
          betalingsreferanse: el('b-referanse').value,
        },
      }),
    'Betalingsoppsettet er lagret.',
  ),
);

el('ny-hentetid').addEventListener('click', () => leggTilHentetidRad(null));
el('lagre-hentetider').addEventListener('click', lagreHentetider);

start().catch((feil) => {
  if (feil instanceof ApiFeil && (feil.status === 401 || feil.status === 403)) visInnlogging();
  else {
    el('laster').hidden = true;
    visFeil('feilmelding', feil.message);
  }
});
