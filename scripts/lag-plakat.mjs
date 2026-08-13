/**
 * Lager en utskriftsklar plakat med QR-koden elevene skanner.
 *
 *   npm run plakat -- https://kantine.<navn>.workers.dev
 *
 * Resultatet havner i plakat.html. Åpne den i nettleseren og skriv ut.
 * QR-koden legges inn som SVG rett i filen, så plakaten fungerer uten nett.
 */
import { writeFileSync } from 'node:fs';
import QRCode from 'qrcode';

const url = process.argv[2];
const kantineNavn = process.argv[3] ?? 'Kantina';

if (!url) {
  console.error('Bruk: npm run plakat -- <url> ["Kantinenavn"]');
  process.exit(1);
}

try {
  new URL(url);
} catch {
  console.error(`"${url}" ser ikke ut som en gyldig adresse. Husk https:// foran.`);
  process.exit(1);
}

// Feilkorreksjonsnivaa M taaler at plakaten blir litt slitt eller skitten.
const qrSvg = await QRCode.toString(url, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 900,
});

const visningsUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

const html = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<title>Plakat – ${kantineNavn}</title>
<style>
  @page { size: A4; margin: 12mm; }

  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: #1d1b16;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }

  .plakat {
    width: 186mm;
    text-align: center;
    padding: 10mm 0;
  }

  h1 { font-size: 62px; margin: 0 0 6px; letter-spacing: -0.02em; }
  .ingress { font-size: 27px; color: #6b6559; margin: 0 0 14mm; }

  .qr {
    width: 118mm;
    height: 118mm;
    margin: 0 auto;
    padding: 7mm;
    border: 3px solid #1d1b16;
    border-radius: 10mm;
  }

  .qr svg { width: 100%; height: 100%; display: block; }

  .url {
    margin-top: 10mm;
    font-size: 25px;
    font-weight: 700;
    word-break: break-all;
  }

  .steg {
    margin-top: 12mm;
    display: flex;
    justify-content: center;
    gap: 9mm;
    font-size: 19px;
    color: #6b6559;
  }

  .steg div { max-width: 46mm; }
  .steg b { display: block; font-size: 30px; color: #b3491e; }

  @media print {
    body { min-height: auto; }
    .skjul-ved-utskrift { display: none; }
  }

  .skjul-ved-utskrift {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #1d1b16;
    color: #fff;
    padding: 10px 18px;
    border-radius: 999px;
    font-size: 14px;
  }
</style>
</head>
<body>
  <div class="plakat">
    <h1>${kantineNavn}</h1>
    <p class="ingress">Skann og bestill</p>

    <div class="qr">${qrSvg}</div>

    <div class="url">${visningsUrl}</div>

    <div class="steg">
      <div><b>1</b> Skann koden med kameraet</div>
      <div><b>2</b> Velg det du vil ha</div>
      <div><b>3</b> Betal og hent i luka</div>
    </div>
  </div>

  <div class="skjul-ved-utskrift">Trykk Ctrl/Cmd + P for å skrive ut</div>
</body>
</html>
`;

writeFileSync('plakat.html', html);
console.log('Skrev plakat.html – åpne den i nettleseren og skriv ut.');
console.log(`QR-koden peker til: ${url}`);
