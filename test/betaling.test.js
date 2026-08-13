import { describe, expect, it } from 'vitest';
import { velgDriver } from '../src/betaling/index.js';
import { HttpError } from '../src/util.js';

const ordre = {
  id: 7,
  dato: '2026-06-15',
  hentenummer: 42,
  offentlig_id: 'abc-123',
  total_ore: 8500,
};

describe('velgDriver', () => {
  it('velger Vippsnummer-varianten som standard', () => {
    expect(velgDriver({}).navn).toBe('vipps_qr');
  });

  it('velger ePayment naar det er satt', () => {
    expect(velgDriver({ BETALINGSMETODE: 'vipps_epayment' }).navn).toBe('vipps_epayment');
  });

  it('faller tilbake til den gratis varianten ved skrivefeil i oppsettet', () => {
    // Salget skal ikke stoppe fordi noen skrev feil i wrangler.jsonc.
    expect(velgDriver({ BETALINGSMETODE: 'vipsss' }).navn).toBe('vipps_qr');
  });
});

describe('vipps_qr', () => {
  const driver = velgDriver({ BETALINGSMETODE: 'vipps_qr' });

  it('krever at betalingen bekreftes av et menneske', () => {
    expect(driver.krevManuellBekreftelse).toBe(true);
  });

  it('sier fra tydelig naar Vippsnummer mangler', () => {
    expect(() => driver.sjekkOppsett({ VIPPSNUMMER: '' })).toThrow(HttpError);
    expect(() => driver.sjekkOppsett({})).toThrow(/Vippsnummer/);
  });

  it('gir eleven nummer, belop og hentenummer som melding', () => {
    const betaling = driver.startBetaling({ env: { VIPPSNUMMER: '123456' }, ordre });

    expect(betaling.vippsnummer).toBe('123456');
    expect(betaling.belop_ore).toBe(8500);
    expect(betaling.belop_tekst).toBe('85,00 kr');
    // Meldingen er det som knytter innbetalingen til ordren i luka.
    expect(betaling.melding).toBe('#42');
  });

  it('lar statusen staa slik dashbordet satte den', async () => {
    const uendret = await driver.sjekkStatus({ ordre: { ...ordre, betalingsstatus: 'betalt' } });
    expect(uendret).toBe('betalt');
  });
});

describe('vipps_epayment', () => {
  const driver = velgDriver({ BETALINGSMETODE: 'vipps_epayment' });

  it('bekrefter betalinger automatisk', () => {
    expect(driver.krevManuellBekreftelse).toBe(false);
  });

  it('lister opp nokkelen som mangler i oppsettet', () => {
    expect(() => driver.sjekkOppsett({})).toThrow(/VIPPS_CLIENT_ID/);

    const nestenFerdig = {
      VIPPS_CLIENT_ID: 'a',
      VIPPS_CLIENT_SECRET: 'b',
      VIPPS_SUBSCRIPTION_KEY: 'c',
    };
    expect(() => driver.sjekkOppsett(nestenFerdig)).toThrow(/VIPPS_MSN/);
  });

  it('godtar et komplett oppsett', () => {
    const komplett = {
      VIPPS_CLIENT_ID: 'a',
      VIPPS_CLIENT_SECRET: 'b',
      VIPPS_SUBSCRIPTION_KEY: 'c',
      VIPPS_MSN: 'd',
    };
    expect(() => driver.sjekkOppsett(komplett)).not.toThrow();
  });
});
