import { HttpError, base64UrlDecode, base64UrlEncode, likeStrenger } from './util.js';

// Hvor lenge en innlogging varer. En skoledag med god margin, så de som står
// i luka slipper å taste PIN om igjen midt i storefri.
const GYLDIG_SEKUNDER = 12 * 60 * 60;

const COOKIE_NAVN = 'kantine_okt';

/**
 * Signeringsnokkelen utledes fra PIN-kodene. Det betyr at alle okter blir
 * ugyldige i det noen bytter PIN, som er akkurat det man vil når en elev
 * slutter i faget.
 */
async function hentNokkel(env) {
  const grunnlag = `${env.ANSATT_PIN ?? ''}|${env.ADMIN_PIN ?? ''}`;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(grunnlag),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signer(env, innhold) {
  const nokkel = await hentNokkel(env);
  const signatur = await crypto.subtle.sign('HMAC', nokkel, new TextEncoder().encode(innhold));
  return base64UrlEncode(signatur);
}

/** Lager et token på formen <base64(payload)>.<base64(hmac)>. */
export async function lagToken(env, rolle) {
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ rolle, utloper: Math.floor(Date.now() / 1000) + GYLDIG_SEKUNDER }),
    ),
  );
  return `${payload}.${await signer(env, payload)}`;
}

export async function lesToken(env, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signatur] = token.split('.', 2);

  const forventet = await signer(env, payload);
  if (!likeStrenger(signatur, forventet)) return null;

  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (typeof data.utloper !== 'number' || data.utloper < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

function hentCookie(request, navn) {
  const raa = request.headers.get('cookie') ?? '';
  for (const del of raa.split(';')) {
    const [nokkel, ...resten] = del.trim().split('=');
    if (nokkel === navn) return resten.join('=');
  }
  return null;
}

export function settOktCookie(token) {
  // HttpOnly + SameSite=Lax gjør at cookien ikke kan leses av skript og ikke
  // folger med på forespørsler fra andre nettsteder.
  return `${COOKIE_NAVN}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${GYLDIG_SEKUNDER}`;
}

export function slettOktCookie() {
  return `${COOKIE_NAVN}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Sjekker at forespørselen kommer fra en innlogget ansatt.
 * rolle "admin" gir ogsaa tilgang til alt en "ansatt" kan gjøre.
 */
export async function krevInnlogging(request, env, paakrevdRolle = 'ansatt') {
  const okt = await lesToken(env, hentCookie(request, COOKIE_NAVN));
  if (!okt) throw new HttpError(401, 'Du må logge inn.');
  if (paakrevdRolle === 'admin' && okt.rolle !== 'admin') {
    throw new HttpError(403, 'Denne siden krever admin-PIN.');
  }
  return okt;
}

/** Finner ut hvilken rolle en PIN gir, eller null om den er feil. */
export function rolleForPin(env, pin) {
  if (typeof pin !== 'string' || pin.length === 0) return null;
  // Admin sjekkes først, slik at samme PIN i begge felt gir den sterkeste rollen.
  if (env.ADMIN_PIN && likeStrenger(pin, env.ADMIN_PIN)) return 'admin';
  if (env.ANSATT_PIN && likeStrenger(pin, env.ANSATT_PIN)) return 'ansatt';
  return null;
}
