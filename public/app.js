import { api, ApiFeil, kr, lag, visFeil } from './felles.js';

// vare_id -> antall
const kurv = new Map();
let meny = null;

const el = (id) => document.getElementById(id);

// Navn og klasse huskes mellom bestillinger, så eleven slipper å skrive det
// hver dag. Det ligger bare i denne nettleseren.
const HUSK_NOKKEL = 'kantine_elev';

function lastHusket() {
  try {
    const lagret = JSON.parse(localStorage.getItem(HUSK_NOKKEL) ?? '{}');
    if (lagret.navn) el('elev-navn').value = lagret.navn;
    if (lagret.klasse) el('klasse').value = lagret.klasse;
  } catch {
    // Ugyldig lagret verdi er ikke verdt å bry brukeren med.
  }
}

function husk() {
  try {
    localStorage.setItem(
      HUSK_NOKKEL,
      JSON.stringify({ navn: el('elev-navn').value, klasse: el('klasse').value }),
    );
  } catch {
    // Privat modus kan blokkere lagring. Bestillingen fungerer uansett.
  }
}

function finnVare(vareId) {
  for (const kategori of meny.kategorier) {
    const treff = kategori.varer.find((v) => v.id === vareId);
    if (treff) return treff;
  }
  return null;
}

function sumIKurv() {
  let sum = 0;
  for (const [vareId, antall] of kurv) {
    sum += (finnVare(vareId)?.pris_ore ?? 0) * antall;
  }
  return sum;
}

function antallIKurv() {
  let antall = 0;
  for (const n of kurv.values()) antall += n;
  return antall;
}

function endreAntall(vare, endring) {
  const nå = kurv.get(vare.id) ?? 0;
  let nytt = nå + endring;

  if (nytt < 0) nytt = 0;
  // Ikke la eleven legge i flere enn det er igjen.
  if (vare.antall_igjen !== null && nytt > vare.antall_igjen) nytt = vare.antall_igjen;
  if (nytt > 10) nytt = 10;

  if (nytt === 0) kurv.delete(vare.id);
  else kurv.set(vare.id, nytt);

  tegnMeny();
  tegnKurv();
}

function tegnVare(vare) {
  const antall = kurv.get(vare.id) ?? 0;
  const utsolgt = !vare.tilgjengelig;

  const maksNaadd =
    utsolgt || (vare.antall_igjen !== null && antall >= vare.antall_igjen) || antall >= 10;

  return lag('div', { klasse: `vare${utsolgt ? ' vare--utsolgt' : ''}` }, [
    vare.emoji ? lag('div', { klasse: 'vare__emoji', 'aria-hidden': 'true', tekst: vare.emoji }) : null,

    lag('div', { klasse: 'vare__midt' }, [
      lag('div', { klasse: 'vare__navn', tekst: vare.navn }),
      vare.beskrivelse
        ? lag('div', { klasse: 'vare__beskrivelse', tekst: vare.beskrivelse })
        : null,
      lag('div', { klasse: 'vare__pris', tekst: kr(vare.pris_ore) }),
      utsolgt
        ? lag('div', { klasse: 'vare__utsolgt-merke', tekst: 'Utsolgt' })
        : vare.antall_igjen !== null && vare.antall_igjen <= 5
          ? lag('div', {
              klasse: 'vare__faa-igjen',
              tekst: `Bare ${vare.antall_igjen} igjen`,
            })
          : null,
    ]),

    utsolgt
      ? null
      : lag('div', { klasse: 'antall' }, [
          lag('button', {
            klasse: 'antall__knapp',
            type: 'button',
            tekst: '−',
            'aria-label': `Fjern én ${vare.navn}`,
            disabled: antall === 0,
            onclick: () => endreAntall(vare, -1),
          }),
          lag('span', {
            klasse: 'antall__tall',
            'aria-live': 'polite',
            tekst: String(antall),
          }),
          lag('button', {
            klasse: 'antall__knapp',
            type: 'button',
            tekst: '+',
            'aria-label': `Legg til én ${vare.navn}`,
            disabled: maksNaadd,
            onclick: () => endreAntall(vare, 1),
          }),
        ]),
  ]);
}

function tegnMeny() {
  const beholder = el('meny');
  beholder.replaceChildren();

  for (const kategori of meny.kategorier) {
    beholder.append(
      lag('section', { klasse: 'kategori' }, [
        lag('h2', { klasse: 'kategori__navn', tekst: kategori.navn }),
        ...kategori.varer.map(tegnVare),
      ]),
    );
  }
}

function tegnKurv() {
  const antall = antallIKurv();
  const harVarer = antall > 0;

  el('kurvlinje').hidden = !harVarer;
  el('bestilling').hidden = !harVarer;
  el('kurv-antall').textContent = antall === 1 ? '1 vare' : `${antall} varer`;
  el('kurv-sum').textContent = kr(sumIKurv());
}

/**
 * Fyller nedtrekkslista med de hentetidene det fortsatt går an å velge.
 * Har alle fristene gått ut, sier vi det i stedet for å la eleven velge noe
 * serveren avviser.
 */
function tegnHentetider() {
  const felt = el('hentetid-felt');
  const valg = el('hentetid');
  const beskjed = el('hentetid-beskjed');

  const apne = meny.hentetider.filter((ht) => ht.apen);

  if (meny.hentetider.length === 0) {
    felt.hidden = true;
    return;
  }

  felt.hidden = false;

  if (apne.length === 0) {
    valg.hidden = true;
    beskjed.hidden = false;
    beskjed.textContent =
      'Alle hentetidspunktene for i dag har gått ut. Du kan bestille likevel – snakk med dem i luka om når du kan hente.';
    return;
  }

  valg.hidden = false;
  beskjed.hidden = true;

  const valgtFraFor = valg.value;
  valg.replaceChildren(...apne.map((ht) => lag('option', { value: ht.id, tekst: ht.navn })));
  // Behold valget hvis det fortsatt er mulig.
  if (apne.some((ht) => String(ht.id) === valgtFraFor)) valg.value = valgtFraFor;
}

async function bestill() {
  const knapp = el('bestill-knapp');
  visFeil('feilmelding', '');

  const navn = el('elev-navn').value.trim();
  if (navn.length < 2) {
    visFeil('feilmelding', 'Skriv navnet ditt, så vi vet hvem maten er til.');
    el('elev-navn').focus();
    return;
  }

  knapp.disabled = true;
  knapp.textContent = 'Sender …';

  try {
    husk();

    const svar = await api('/api/ordrer', {
      metode: 'POST',
      kropp: {
        elev_navn: navn,
        klasse: el('klasse').value.trim(),
        merknad: el('merknad').value.trim(),
        // Tom verdi når alle fristene har gått ut - da bestilles det uten tidspunkt.
        hentetid_id: el('hentetid').hidden ? null : el('hentetid').value || null,
        linjer: [...kurv].map(([vare_id, antall]) => ({ vare_id, antall })),
      },
    });

    // Vipps ePayment sender eleven rett til appen. Ellers til kvitteringen,
    // som forteller hvordan det skal betales.
    if (svar.betaling?.redirect_url) {
      window.location.href = svar.betaling.redirect_url;
    } else {
      window.location.href = `/kvittering?ordre=${svar.ordre.offentlig_id}`;
    }
  } catch (feil) {
    visFeil('feilmelding', feil.message);
    knapp.disabled = false;
    knapp.textContent = 'Bestill';

    // Er noe blitt utsolgt mens eleven bladde, hentes menyen på nytt.
    if (feil instanceof ApiFeil && feil.status === 409) {
      await lastMeny();
    }
  }
}

async function lastMeny() {
  meny = await api('/api/meny');

  document.title = `Bestill i ${meny.kantine_navn}`;
  el('kantine-navn').textContent = meny.kantine_navn;
  el('velkomsttekst').textContent = meny.velkomsttekst ?? '';

  el('laster').hidden = true;

  if (!meny.apen) {
    el('stengtmelding').textContent = meny.stengt_melding;
    el('stengtmelding').hidden = false;
    el('meny').replaceChildren();
    el('kurvlinje').hidden = true;
    el('bestilling').hidden = true;
    return;
  }

  el('stengtmelding').hidden = true;

  // Fjern varer fra kurven som ikke lenger kan bestilles.
  for (const vareId of [...kurv.keys()]) {
    const vare = finnVare(vareId);
    if (!vare || !vare.tilgjengelig) kurv.delete(vareId);
    else if (vare.antall_igjen !== null && kurv.get(vareId) > vare.antall_igjen) {
      if (vare.antall_igjen === 0) kurv.delete(vareId);
      else kurv.set(vareId, vare.antall_igjen);
    }
  }

  tegnHentetider();

  if (meny.kategorier.length === 0) {
    el('meny').replaceChildren(
      lag('div', { klasse: 'tom', tekst: 'Ingenting til salgs akkurat nå.' }),
    );
  } else {
    tegnMeny();
  }

  tegnKurv();
}

el('bestill-knapp').addEventListener('click', bestill);
lastHusket();

lastMeny().catch((feil) => {
  el('laster').hidden = true;
  visFeil('feilmelding', feil.message);
});
