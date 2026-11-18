// Verifica contraste WCAG de los tokens de src/index.css. Uso: pnpm --filter @zestia/web contrast
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function tokens(block) {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]),
  );
}

// [foreground, background, mínimo]: 4.5 texto, 3 componentes de UI / indicadores.
const pairs = [
  ['foreground', 'background', 4.5],
  ['foreground', 'card', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'card', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['primary', 'card', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['destructive', 'card', 4.5],
  ['sidebar-foreground', 'sidebar', 4.5],
  ['input', 'card', 3],
  ['input', 'background', 3],
  ['ring', 'background', 3],
  ['ring', 'card', 3],
  ...['neutral', 'info', 'success', 'warning', 'danger'].flatMap((s) => [
    [`status-${s}-fg`, `status-${s}-bg`, 4.5],
    [`status-${s}-dot`, `status-${s}-bg`, 3],
  ]),
];

const themes = {
  claro: tokens(css.split(':root {')[1].split('.dark {')[0]),
  oscuro: tokens(css.split('.dark {')[1].split('@theme')[0]),
};

let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\nTema ${name}`);
  for (const [fg, bg, min] of pairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1 (>= ${min})  ${fg} sobre ${bg}`,
    );
  }
}
if (failed) {
  console.error(`\n${failed} pares no cumplen`);
  process.exit(1);
}
