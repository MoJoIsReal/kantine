/** Feil som er trygg å vise til brukeren. Alt annet blir en generisk 500. */
export class HttpError extends Error {
  constructor(status, melding) {
    super(melding);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Ordredata skal aldri mellomlagres.
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export async function lesJson(request) {
  try {
    const data = await request.json();
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('ikke et objekt');
    }
    return data;
  } catch {
    throw new HttpError(400, 'Ugyldig forespørsel.');
  }
}

/** 3500 -> "35,00 kr" */
export function formaterKr(ore) {
  return `${(ore / 100).toFixed(2).replace('.', ',')} kr`;
}

const OSLO = 'Europe/Oslo';

/** Dagens dato i norsk tid som "YYYY-MM-DD". */
export function datoIOslo(naa = new Date()) {
  // en-CA gir ISO-formatet YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(naa);
}

/** Klokkeslett i norsk tid som "HH:MM". */
export function klokkeslettIOslo(naa = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: OSLO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(naa);
}

/**
 * Fjerner kontrolltegn og kutter lengden, slik at fritekst fra elevene ikke
 * sprenger dashbordet. Verdien blir uansett satt inn med textContent i
 * frontend, så dette handler om støy, ikke om XSS.
 */
export function rensTekst(verdi, maksLengde) {
  if (typeof verdi !== "string") return "";
  let ut = "";
  for (const tegn of verdi) {
    const kode = tegn.codePointAt(0);
    // Hopp over kontrolltegn (inkl. linjeskift) og DEL.
    ut += kode < 32 || kode === 127 ? " " : tegn;
  }
  return ut.replace(/\s+/g, " ").trim().slice(0, maksLengde);
}

/** Konstant-tid sammenligning, så PIN-koden ikke kan gjettes tegn for tegn. */
export function likeStrenger(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Lengden lekker uansett via timing; sammenlign innholdet i konstant tid.
  if (ba.length !== bb.length) return false;
  let ulikhet = 0;
  for (let i = 0; i < ba.length; i++) ulikhet |= ba[i] ^ bb[i];
  return ulikhet === 0;
}

export function base64UrlEncode(bytes) {
  let binaer = '';
  for (const b of new Uint8Array(bytes)) binaer += String.fromCharCode(b);
  return btoa(binaer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(tekst) {
  const padded = tekst.replace(/-/g, '+').replace(/_/g, '/');
  const binaer = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binaer, (c) => c.charCodeAt(0));
}
