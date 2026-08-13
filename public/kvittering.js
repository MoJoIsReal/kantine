import { api, fyll, kr, lag, polling, visFeil } from './felles.js';

const el = (id) => document.getElementById(id);
const offentligId = new URLSearchParams(location.search).get('ordre');

const STATUSTEKST = {
  ny: ['Mottatt', 'merke--grau'],
  under_arbeid: ['Lages nå', 'merke--gul'],
  klar: ['Klar til henting!', 'merke--gronn'],
  levert: ['Hentet', 'merke--grau'],
  avbrutt: ['Avbrutt', 'merke--rod'],
};

/**
 * Kopierer referansen til utklippstavla og bekrefter det på knappen.
 * navigator.clipboard finnes bare på https, så det er en reserveløsning for
 * de tilfellene der den mangler.
 */
async function kopier(tekst, knapp) {
  const opprinneligTekst = knapp.textContent;

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(tekst);
    } else {
      const felt = document.createElement('textarea');
      felt.value = tekst;
      felt.setAttribute('readonly', '');
      felt.style.position = 'fixed';
      felt.style.opacity = '0';
      document.body.append(felt);
      felt.select();
      document.execCommand('copy');
      felt.remove();
    }
    knapp.textContent = 'Kopiert';
  } catch {
    // Klarte vi ikke å kopiere, må eleven skrive den av. Referansen står
    // synlig ved siden av, så det er ingen blindvei.
    knapp.textContent = 'Skriv den av';
  }

  setTimeout(() => {
    knapp.textContent = opprinneligTekst;
  }, 2000);
}

function tegnBetaling(ordre, betaling) {
  const innhold = el('betaling-innhold');
  innhold.replaceChildren();

  if (ordre.betalingsstatus === 'betalt') {
    el('betaling-tittel').textContent = 'Betalt';
    innhold.append(
      lag('div', { klasse: 'melding melding--ok', tekst: 'Betalingen er registrert. Takk!' }),
    );
    return;
  }

  if (ordre.betalingsstatus === 'feilet') {
    el('betaling-tittel').textContent = 'Betalingen gikk ikke gjennom';
    innhold.append(
      lag('div', {
        klasse: 'melding melding--feil',
        tekst: 'Vipps meldte at betalingen ikke ble fullført. Snakk med dem i luka.',
      }),
    );
    return;
  }

  el('betaling-tittel').textContent = 'Slik betaler du';

  if (betaling?.type === 'vipps_qr') {
    fyll(
      innhold,
      lag('div', { klasse: 'stablet' }, [
        lag('div', { klasse: 'tabellsum' }, [
          lag('span', { tekst: 'Send til' }),
          lag('strong', {
            tekst: betaling.mottaker_navn
              ? `${betaling.mottaker_navn} · ${betaling.vippsnummer}`
              : betaling.vippsnummer,
          }),
        ]),
        lag('div', { klasse: 'tabellsum' }, [
          lag('span', { tekst: 'Beløp' }),
          lag('strong', { tekst: betaling.belop_tekst }),
        ]),
      ]),

      // Referansen er det viktigste feltet - uten den vet ikke kjøkkenet
      // hvilken bestilling pengene hører til. Derfor får den egen boks med
      // kopiknapp i stedet for å stå som en linje i lista.
      lag('div', { klasse: 'referanse mellomrom' }, [
        lag('div', { klasse: 'referanse__merkelapp', tekst: 'Skriv dette i meldingsfeltet' }),
        lag('div', { klasse: 'referanse__rad' }, [
          lag('code', { klasse: 'referanse__tekst', tekst: betaling.referanse }),
          lag('button', {
            klasse: 'knapp knapp--liten',
            type: 'button',
            tekst: 'Kopier',
            onclick: (e) => kopier(betaling.referanse, e.currentTarget),
          }),
        ]),
      ]),

      betaling.vipps_lenke
        ? lag('a', {
            klasse: 'knapp knapp--vipps knapp--bred mellomrom',
            href: betaling.vipps_lenke,
            tekst: `Betal ${betaling.belop_tekst} med Vipps`,
          })
        : null,

      lag('div', {
        klasse: 'hjelpetekst mellomrom',
        tekst: betaling.vipps_lenke
          ? `Vipps åpnes med ${betaling.vippsnummer}` +
            `${betaling.mottaker_navn ? ` (${betaling.mottaker_navn})` : ''} ferdig utfylt. ` +
            `Legg inn ${betaling.belop_tekst} som beløp, og lim inn meldingen over.`
          : 'Åpne Vipps, søk opp nummeret eller skann QR-koden ved luka, og lim inn meldingen over.',
      }),
    );
    return;
  }

  if (betaling?.redirect_url) {
    innhold.append(
      lag('a', {
        klasse: 'knapp knapp--bred',
        href: betaling.redirect_url,
        tekst: `Betal ${kr(ordre.total_ore)} med Vipps`,
      }),
    );
    return;
  }

  innhold.append(
    lag('div', {
      klasse: 'melding melding--info',
      tekst: 'Venter på betaling. Ta kontakt i luka hvis det stopper opp.',
    }),
  );
}

function tegn(ordre, betaling) {
  el('laster').hidden = true;
  el('kvittering').hidden = false;

  el('hentenummer').textContent = `#${ordre.hentenummer}`;
  el('hentetid').textContent = ordre.hentetid_navn ? `Hentes ${ordre.hentetid_navn}` : '';

  const [tekst, klasse] = STATUSTEKST[ordre.status] ?? ['Mottatt', 'merke--grau'];
  const merke = el('statusmerke');
  merke.textContent = tekst;
  merke.className = `merke ${klasse}`;

  el('linjer').replaceChildren(
    ...ordre.linjer.map((linje) =>
      lag('div', { klasse: 'tabellsum' }, [
        lag('span', { tekst: `${linje.antall} × ${linje.emoji} ${linje.navn}`.replace('  ', ' ') }),
        lag('span', { tekst: kr(linje.pris_ore * linje.antall) }),
      ]),
    ),
  );

  el('total').textContent = kr(ordre.total_ore);
  tegnBetaling(ordre, betaling);
}

async function last() {
  const { ordre } = await api(`/api/ordrer/${encodeURIComponent(offentligId)}`);

  // Betalingsinstruksjonen hentes bare så lenge det faktisk skal betales.
  let betaling = null;
  if (ordre.betalingsstatus === 'venter') {
    try {
      const svar = await api(`/api/ordrer/${encodeURIComponent(offentligId)}/betaling`, {
        metode: 'POST',
      });
      betaling = svar.betaling;
    } catch (feil) {
      console.error(feil);
    }
  }

  tegn(ordre, betaling);
}

if (!offentligId) {
  el('laster').hidden = true;
  visFeil('feilmelding', 'Mangler bestillingsnummer. Gå tilbake og bestill på nytt.');
} else {
  // Oppdaterer jevnlig, slik at eleven ser "Klar til henting" uten å laste om.
  polling(async () => {
    try {
      await last();
    } catch (feil) {
      el('laster').hidden = true;
      visFeil('feilmelding', feil.message);
    }
  }, 5000);
}
