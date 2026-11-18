// Verifica contraste WCAG 2.2 de los tokens de src/index.css (claro y oscuro).
// Uso: pnpm --filter @zestia/web contrast  — sale con código 1 si algún par no cumple
// o si falta un token. Mínimos: 4.5 texto normal; 3 para indicadores, bordes de control y foco.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Primer bloque `selector { ... }` (sin anidamiento). */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No se encontró el bloque ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

function tokens(text) {
  return Object.fromEntries(
    [...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}

const TONES = ['slate', 'blue', 'teal', 'violet', 'green', 'red', 'amber', 'earth'];
const SURFACES = ['card', 'background', 'raised', 'subtle'];

// [frente, fondo, mínimo, uso]
const pairs = [
  // Texto
  ...SURFACES.flatMap((s) => [
    ['foreground', s, 4.5, 'texto principal'],
    ['muted-foreground', s, 4.5, 'texto secundario'],
  ]),
  ['muted-foreground', 'muted', 4.5, 'texto secundario sobre muted'],
  ['foreground', 'accent', 4.5, 'texto sobre fila seleccionada'],
  ['accent-foreground', 'accent', 4.5, 'texto activo'],
  ['primary-foreground', 'primary', 4.5, 'botón principal'],
  ['primary', 'card', 3, 'borde/contorno de botón principal'],
  ['destructive-foreground', 'destructive', 4.5, 'botón destructivo'],
  ['destructive', 'card', 4.5, 'texto de error'],
  ['destructive', 'background', 4.5, 'texto de error'],
  // Marca
  ['brand-foreground', 'brand', 4.5, 'texto sobre lapacho'],
  ['brand-ink', 'card', 4.5, 'texto lapacho'],
  ['brand-ink', 'brand-soft', 4.5, 'texto lapacho sobre su tinte'],
  ['foreground', 'brand-soft', 4.5, 'texto sobre tinte de llegada'],
  ['brand', 'card', 3, 'rastro de llegada / selección'],
  ['brand', 'background', 3, 'rastro de llegada / selección'],
  // Controles y foco
  ['input', 'card', 3, 'borde de campo'],
  ['input', 'background', 3, 'borde de campo'],
  ['input', 'raised', 3, 'borde de campo en capa'],
  ['ring', 'card', 3, 'foco'],
  ['ring', 'background', 3, 'foco'],
  ['ring', 'raised', 3, 'foco en capa'],
  ['sidebar-ring', 'sidebar', 3, 'foco en barra lateral'],
  ['sidebar-ring', 'sidebar-accent', 3, 'foco en ítem activo'],
  // Barra lateral
  ['sidebar-foreground', 'sidebar', 4.5, 'navegación'],
  ['sidebar-foreground', 'sidebar-accent', 4.5, 'navegación activa'],
  ['sidebar-muted', 'sidebar', 4.5, 'navegación secundaria'],
  ['sidebar-brand', 'sidebar', 3, 'marcador activo'],
  ['sidebar-brand', 'sidebar-accent', 3, 'marcador activo'],
  // Tonos de estado
  ...TONES.flatMap((t) => [
    [`tone-${t}-fg`, `tone-${t}-bg`, 4.5, `etiqueta ${t}`],
    [`tone-${t}-fg`, 'card', 4.5, `texto ${t} sobre tarjeta`],
    [`tone-${t}-solid`, `tone-${t}-bg`, 3, `punto ${t} en etiqueta`],
    [`tone-${t}-solid`, 'card', 3, `riel/borde ${t} sobre tarjeta`],
    [`tone-${t}-solid`, 'background', 3, `riel/borde ${t} sobre fondo`],
  ]),
];

const themes = { claro: tokens(block(':root')), oscuro: tokens(block('.dark')) };

let failed = 0;
const rows = [];
for (const [name, t] of Object.entries(themes)) {
  console.log(`\nTema ${name}`);
  for (const [fg, bg, min, use] of pairs) {
    if (!t[fg] || !t[bg]) {
      failed++;
      console.log(`  FALTA token: ${!t[fg] ? fg : bg}`);
      continue;
    }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    rows.push({ name, fg, bg, r });
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1 (>= ${min})  ${fg} sobre ${bg} — ${use}`,
    );
  }
}

const min = (theme) => Math.min(...rows.filter((r) => r.name === theme).map((r) => r.r));
console.log(
  `\n${pairs.length * 2} pares verificados. Mínimo claro ${min('claro').toFixed(2)}:1, oscuro ${min('oscuro').toFixed(2)}:1.`,
);
if (failed) {
  console.error(`\n${failed} pares no cumplen o faltan`);
  process.exit(1);
}
