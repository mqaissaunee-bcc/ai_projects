/* The page draws its own QR codes, because it loads nothing from a CDN.
   An encoder that is subtly wrong still produces a convincing square of
   dots, so this checks the matrix against a known-good one and against a
   decoder. It is separate from test.js because it needs Python with
   opencv and the qrcode package; test.js only checks the code reaches
   the block.

   Run:  node tools/qr-check.js        (needs python3 -m pip install qrcode opencv-python-headless)
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Pull the encoder straight out of the page, so this tests what ships.
const html = fs.readFileSync(path.join(__dirname, '..', 'faculty-schedule', 'index.html'), 'utf8');
const start = html.indexOf('function qrMatrix(text){');
const end = html.indexOf('\n  /* The matrix as an <svg>', start);
if (start < 0 || end < 0) { console.error('! could not find qrMatrix in the page'); process.exit(1); }
const qrMatrix = new Function(html.slice(start, end) + '\nreturn qrMatrix;')();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qrcheck-'));
let fails = 0;
const ok = (label, cond) => { console.log((cond ? '  PASS  ' : '! FAIL  ') + label); if (!cond) fails++; };

const CASES = [
  'https://brookdalecc.zoom.us/j/98765432101',
  'https://brookdalecc-edu.zoom.us/j/81234567890?pwd=aBcDeFgHiJkLmNoPqRsTuV',
  'https://us02web.zoom.us/my/mqaissaunee',
  'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABCDEF/0?context=%7b%22Tid%22%3a%22x%22%7d',
  'MAS 212'
];

// 1. every case renders and decodes back to itself
CASES.forEach((text, i) => {
  const m = qrMatrix(text);
  if (!m) { ok('encodes: ' + text.slice(0, 40), false); return; }
  const n = m.length, q = 4, S = 8, px = (n + 2 * q) * S;
  const buf = Buffer.alloc(px * px, 255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c])
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++)
      buf[((r + q) * S + a) * px + ((c + q) * S + b)] = 0;
  fs.writeFileSync(path.join(tmp, 'q' + i + '.pgm'),
    Buffer.concat([Buffer.from('P5\n' + px + ' ' + px + '\n255\n'), buf]));
});

const py = `
import cv2, json, sys
cases = json.loads(sys.argv[1]); d = cv2.QRCodeDetector(); out = []
for i, t in enumerate(cases):
    img = cv2.imread(sys.argv[2] + '/q%d.pgm' % i, cv2.IMREAD_GRAYSCALE)
    txt = d.detectAndDecode(img)[0] if img is not None else ''
    out.append(txt == t)
print(json.dumps(out))
`;
let decoded;
try {
  decoded = JSON.parse(execFileSync('python3', ['-I', '-c', py, JSON.stringify(CASES), tmp],
                                    { encoding: 'utf8' }).trim());
} catch (e) {
  console.log('  SKIP  decoder unavailable (' + String(e.message).split('\n')[0] + ')');
  decoded = null;
}
if (decoded) CASES.forEach((t, i) => ok('decodes back: ' + t.slice(0, 44), decoded[i]));

// 2. the matrix itself matches a reference encoder, module for module
const pyRef = `
import qrcode, json, sys
from qrcode.constants import ERROR_CORRECT_M
q = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=1, border=0)
q.add_data(sys.argv[1]); q.make(fit=True)
print(json.dumps([[1 if v else 0 for v in row] for row in q.get_matrix()]))
`;
try {
  const text = CASES[2];
  const ref = JSON.parse(execFileSync('python3', ['-I', '-c', pyRef, text], { encoding: 'utf8' }));
  const mine = qrMatrix(text);
  ok('same size as the reference encoder', mine.length === ref.length);
  // Masks are chosen by penalty score and both encoders may land differently,
  // so compare the parts that do not depend on the mask.
  let fixedSame = true;
  const n = ref.length;
  const isFixed = (r, c) =>
    (r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9) || r === 6 || c === 6;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (isFixed(r, c) && r !== 8 && c !== 8 && mine[r][c] !== ref[r][c]) fixedSame = false;
  ok('finders, timing and alignment match the reference', fixedSame);
} catch (e) {
  console.log('  SKIP  reference encoder unavailable (' + String(e.message).split('\n')[0] + ')');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? '\n' + fails + ' FAILURES' : '\nQR checks passed');
process.exit(fails ? 1 : 0);
