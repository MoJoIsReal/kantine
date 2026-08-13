import { describe, expect, it } from 'vitest';
import { velgDriver } from '../src/betaling/index.js';
import { lagReferanse, lagVippsLenke } from '../src/betaling/vipps_qr.js';
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
    expect(() => driver.sjekkOppsett({}, { vippsnummer: '' })).toThrow(HttpError);
    expect(() => driver.sjekkOppsett({}, {})).toThrow(/Vippsnummer/);
  });

  it('gir eleven nummer, belop og referanse', () => {
    const betaling = driver.startBetaling({
      env: { VIPPSNUMMER: '93936700', VIPPS_MOTTAKER_NAVN: 'Steffen Kvalheim' },
      ordre,
    });

    expect(betaling.vippsnummer).toBe('93936700');
    expect(betaling.mottaker_navn).toBe('Steffen Kvalheim');
    expect(betaling.belop_ore).toBe(8500);
    expect(betaling.belop_tekst).toBe('85,00 kr');
    // Referansen er det som knytter innbetalingen til ordren i luka.
    expect(betaling.referanse).toBe('KANTINE Ordre: 42');
  });

  it('lager en Vipps-lenke naar nummeret er et mobilnummer', () => {
    const betaling = driver.startBetaling({ env: { VIPPSNUMMER: '93936700' }, ordre });
    expect(betaling.vipps_lenke).toBe('https://qr.vipps.no/28/2/01/031/4793936700?v=1');
    expect(betaling.beloep_maa_tastes).toBe(true);
  });

  it('dropper knappen naar nummeret er et bedrifts-Vippsnummer', () => {
    const betaling = driver.startBetaling({ env: { VIPPSNUMMER: '123456' }, ordre });
    expect(betaling.vipps_lenke).toBe(null);
    expect(betaling.beloep_maa_tastes).toBe(false);
  });

  it('lar VIPPS_LENKE overstyre den genererte lenken', () => {
    const betaling = driver.startBetaling({
      env: { VIPPSNUMMER: '93936700', VIPPS_LENKE: 'https://qr.vipps.no/noe-annet' },
      ordre,
    });
    expect(betaling.vipps_lenke).toBe('https://qr.vipps.no/noe-annet');
  });

  it('lar BETALINGSREFERANSE endre prefikset', () => {
    expect(lagReferanse({ BETALINGSREFERANSE: 'Kantina bestilling' }, ordre)).toBe(
      'Kantina bestilling 42',
    );
    expect(lagReferanse({}, ordre)).toBe('KANTINE Ordre: 42');
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

describe('lagVippsLenke', () => {
  it('lager lenke fra et vanlig mobilnummer', () => {
    expect(lagVippsLenke('93936700')).toBe('https://qr.vipps.no/28/2/01/031/4793936700?v=1');
  });

  it('godtar landkode og mellomrom skrevet på ulike måter', () => {
    const forventet = 'https://qr.vipps.no/28/2/01/031/4793936700?v=1';
    expect(lagVippsLenke('4793936700')).toBe(forventet);
    expect(lagVippsLenke('004793936700')).toBe(forventet);
    expect(lagVippsLenke('+47 939 36 700')).toBe(forventet);
    expect(lagVippsLenke('939 36 700')).toBe(forventet);
  });

  it('godtar numre som begynner på 4', () => {
    expect(lagVippsLenke('41234567')).toBe('https://qr.vipps.no/28/2/01/031/4741234567?v=1');
  });

  it('gir ingen lenke for et Vippsnummer for bedrifter', () => {
    // Bedriftsnumre er 5-6 siffer og har ikke denne lenkeformen. En knapp her
    // ville sendt eleven til en side som ikke finnes.
    expect(lagVippsLenke('123456')).toBe(null);
    expect(lagVippsLenke('12345')).toBe(null);
  });

  it('gir ingen lenke for tull', () => {
    expect(lagVippsLenke('')).toBe(null);
    expect(lagVippsLenke('12345678')).toBe(null); // fastnummer, ikke mobil
    expect(lagVippsLenke('999999999999')).toBe(null);
  });
});

describe('vipps_qr henter oppsettet fra innstillingene', () => {
  const driver = velgDriver({ BETALINGSMETODE: 'vipps_qr' });

  it('lar admin-innstillingen vinne over wrangler.jsonc', () => {
    const betaling = driver.startBetaling({
      env: { VIPPSNUMMER: '111111', VIPPS_MOTTAKER_NAVN: 'Gammelt navn' },
      innstillinger: { vippsnummer: '93936700', vipps_mottaker_navn: 'Kantina' },
      ordre,
    });

    expect(betaling.vippsnummer).toBe('93936700');
    expect(betaling.mottaker_navn).toBe('Kantina');
  });

  it('faller tilbake til miljøvariabelen naar innstillingen er tom', () => {
    // Slik at oppsett som alt har nummeret i wrangler.jsonc fortsetter å virke.
    const betaling = driver.startBetaling({
      env: { VIPPSNUMMER: '93936700' },
      innstillinger: { vippsnummer: '' },
      ordre,
    });

    expect(betaling.vippsnummer).toBe('93936700');
  });

  it('bruker referanseprefikset fra innstillingene', () => {
    const betaling = driver.startBetaling({
      env: {},
      innstillinger: { vippsnummer: '93936700', betalingsreferanse: 'Kantina bestilling' },
      ordre,
    });

    expect(betaling.referanse).toBe('Kantina bestilling 42');
  });

  it('krever Vippsnummer et av stedene', () => {
    expect(() => driver.sjekkOppsett({}, {})).toThrow(/Vippsnummer/);
    expect(() => driver.sjekkOppsett({}, { vippsnummer: '93936700' })).not.toThrow();
    expect(() => driver.sjekkOppsett({ VIPPSNUMMER: '123456' }, {})).not.toThrow();
  });
});
