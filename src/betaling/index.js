import * as vippsQr from './vipps_qr.js';
import * as vippsEpayment from './vipps_epayment.js';

const DRIVERE = {
  vipps_qr: vippsQr,
  vipps_epayment: vippsEpayment,
};

/**
 * Velger betalingsmaate ut fra BETALINGSMETODE i wrangler.jsonc.
 * Ukjent verdi faller tilbake til den gratis varianten, slik at en skrivefeil
 * i oppsettet ikke stopper salget.
 */
export function velgDriver(env) {
  const valgt = env.BETALINGSMETODE ?? 'vipps_qr';
  const driver = DRIVERE[valgt];
  if (!driver) {
    console.warn(`Ukjent BETALINGSMETODE "${valgt}", bruker vipps_qr.`);
    return vippsQr;
  }
  return driver;
}
