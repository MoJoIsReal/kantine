import { describe, expect, it } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  datoIOslo,
  formaterKr,
  klokkeslettIOslo,
  likeStrenger,
  rensTekst,
} from '../src/util.js';

describe('formaterKr', () => {
  it('viser ore som kroner med komma', () => {
    expect(formaterKr(3500)).toBe('35,00 kr');
    expect(formaterKr(2550)).toBe('25,50 kr');
    expect(formaterKr(0)).toBe('0,00 kr');
    expect(formaterKr(5)).toBe('0,05 kr');
  });
});

describe('rensTekst', () => {
  it('kutter til maks lengde', () => {
    expect(rensTekst('abcdefghij', 4)).toBe('abcd');
  });

  it('fjerner linjeskift og andre kontrolltegn', () => {
    expect(rensTekst('Ola\nNordmann', 50)).toBe('Ola Nordmann');
    expect(rensTekst('a\tb', 50)).toBe('a b');
  });

  it('slaar sammen gjentatte mellomrom og trimmer', () => {
    expect(rensTekst('  Ola    Nordmann  ', 50)).toBe('Ola Nordmann');
  });

  it('beholder norske tegn og emoji', () => {
    expect(rensTekst('Bjørn Ærø 🥖', 50)).toBe('Bjørn Ærø 🥖');
  });

  it('gir tom streng for noe som ikke er tekst', () => {
    expect(rensTekst(null, 10)).toBe('');
    expect(rensTekst(42, 10)).toBe('');
    expect(rensTekst(undefined, 10)).toBe('');
  });
});

describe('likeStrenger', () => {
  it('kjenner igjen like strenger', () => {
    expect(likeStrenger('1234', '1234')).toBe(true);
  });

  it('avviser ulike strenger og ulik lengde', () => {
    expect(likeStrenger('1234', '1235')).toBe(false);
    expect(likeStrenger('1234', '12345')).toBe(false);
    expect(likeStrenger('', '1')).toBe(false);
  });

  it('avviser verdier som ikke er tekst', () => {
    expect(likeStrenger(null, '1234')).toBe(false);
    expect(likeStrenger(1234, 1234)).toBe(false);
  });
});

describe('base64url', () => {
  it('kan kode og dekode tilbake til samme bytes', () => {
    const original = new TextEncoder().encode('Bjørn 🥖 #42');
    const rundtur = new TextDecoder().decode(base64UrlDecode(base64UrlEncode(original)));
    expect(rundtur).toBe('Bjørn 🥖 #42');
  });

  it('bruker ikke tegn som maa escapes i URL', () => {
    const kodet = base64UrlEncode(new Uint8Array([251, 255, 190, 254]));
    expect(kodet).not.toMatch(/[+/=]/);
  });
});

describe('norsk tid', () => {
  // Om sommeren er Norge to timer foran UTC, om vinteren én.
  it('regner om til norsk dato ved midnatt UTC om sommeren', () => {
    const tidspunkt = new Date('2026-06-15T22:30:00Z');
    expect(datoIOslo(tidspunkt)).toBe('2026-06-16');
    expect(klokkeslettIOslo(tidspunkt)).toBe('00:30');
  });

  it('regner riktig om vinteren', () => {
    const tidspunkt = new Date('2026-01-15T23:30:00Z');
    expect(datoIOslo(tidspunkt)).toBe('2026-01-16');
    expect(klokkeslettIOslo(tidspunkt)).toBe('00:30');
  });

  it('gir klokkeslett paa formatet TT:MM som kan sammenlignes med tekst', () => {
    const morgen = klokkeslettIOslo(new Date('2026-06-15T06:05:00Z'));
    const kveld = klokkeslettIOslo(new Date('2026-06-15T18:05:00Z'));
    expect(morgen).toBe('08:05');
    expect(kveld).toBe('20:05');
    // Dette er forutsetningen for fristsjekken paa hentetider.
    expect(morgen < kveld).toBe(true);
  });
});
