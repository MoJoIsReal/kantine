// Små hjelpere som alle sidene bruker. Ingen rammeverk - det holder her, og
// det gjør at systemet kan vedlikeholdes uten byggesteg eller npm.

/** 3500 -> "35,00 kr" */
export function kr(ore) {
  return `${(ore / 100).toFixed(2).replace('.', ',')} kr`;
}

/** Feil fra API-et, med meldingen serveren skrev. */
export class ApiFeil extends Error {
  constructor(melding, status) {
    super(melding);
    this.status = status;
  }
}

export async function api(sti, { metode = 'GET', kropp } = {}) {
  const svar = await fetch(sti, {
    method: metode,
    headers: kropp ? { 'content-type': 'application/json' } : undefined,
    body: kropp ? JSON.stringify(kropp) : undefined,
  });

  let data = {};
  try {
    data = await svar.json();
  } catch {
    // Tomt eller ugyldig svar handteres av sjekken under.
  }

  if (!svar.ok) {
    throw new ApiFeil(data.feil ?? 'Noe gikk galt. Prøv igjen.', svar.status);
  }
  return data;
}

/**
 * Lager et element. Tekst settes alltid med textContent, aldri innerHTML, slik
 * at navn og meldinger fra elevene ikke kan smugle inn markup.
 */
export function lag(tag, egenskaper = {}, barn = []) {
  const el = document.createElement(tag);

  for (const [nokkel, verdi] of Object.entries(egenskaper)) {
    if (verdi === null || verdi === undefined || verdi === false) continue;
    if (nokkel === 'tekst') el.textContent = verdi;
    else if (nokkel === 'klasse') el.className = verdi;
    else if (nokkel.startsWith('on')) el.addEventListener(nokkel.slice(2), verdi);
    else if (verdi === true) el.setAttribute(nokkel, '');
    else el.setAttribute(nokkel, verdi);
  }

  for (const b of [barn].flat()) {
    if (b) el.append(b);
  }
  return el;
}

export function visFeil(elementId, melding) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = melding;
  el.hidden = !melding;
  if (melding) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Kjører en funksjon med jevne mellomrom, men pauser når fanen er skjult. */
export function polling(funksjon, millisekunder) {
  let tidsavbrudd;

  const kjør = async () => {
    if (document.visibilityState === 'visible') {
      try {
        await funksjon();
      } catch (feil) {
        console.error(feil);
      }
    }
    tidsavbrudd = setTimeout(kjør, millisekunder);
  };

  kjør();
  // Hent med en gang brukeren kommer tilbake til fanen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clearTimeout(tidsavbrudd);
      kjør();
    }
  });

  return () => clearTimeout(tidsavbrudd);
}
