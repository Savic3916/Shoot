// Generates the Shoot logo PNGs from one SVG definition using headless Chrome.
// Usage: node scripts/make-brand-assets.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.cwd() + '/assets/images';
const WORK = process.env.TEMP + '/shoot-brand';
mkdirSync(WORK, { recursive: true });

const TEAL_LIGHT = '#14897A';
const TEAL_DEEP = '#093F37';
const AMBER = '#F4B942';

// The "S" is a shot: it curves in from the bottom-left and ends in the ball at the top-right.
const S_PATH = 'M82 40 C 70 22, 34 26, 38 47 C 42 66, 84 58, 82 79 C 80 98, 44 100, 31 83';

function mark({ stroke = '#FFFFFF', ball = AMBER, dots = true }) {
  const trail = dots
    ? `<circle cx="22" cy="90" r="3.2" fill="${stroke}" opacity=".7"/>
       <circle cx="15" cy="96" r="2.4" fill="${stroke}" opacity=".45"/>
       <circle cx="9.5" cy="101" r="1.7" fill="${stroke}" opacity=".25"/>`
    : '';
  return `<path d="${S_PATH}" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round"/>
    ${trail}
    <circle cx="86" cy="36" r="11" fill="${ball}"/>
    <path d="M86 29.5 L91.2 33.3 L89.2 39.4 L82.8 39.4 L80.8 33.3 Z" fill="${TEAL_DEEP}" opacity=".85"/>`;
}

function svg({ size, background, content, scale = 1 }) {
  const offset = (120 - 120 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TEAL_LIGHT}"/><stop offset="1" stop-color="${TEAL_DEEP}"/>
    </linearGradient></defs>
    ${background ?? ''}
    <g transform="translate(${offset} ${offset}) scale(${scale})">${content}</g>
  </svg>`;
}

const variants = [
  // App icon: full-bleed gradient, mark at ~80%.
  { file: 'icon.png', size: 1024, transparent: false,
    svg: svg({ size: 1024, background: '<rect width="120" height="120" fill="url(#g)"/>', content: mark({}), scale: 0.84 }) },
  // Android adaptive icon: mark inside the 66% safe zone on a transparent layer.
  { file: 'android-icon-foreground.png', size: 1024, transparent: true,
    svg: svg({ size: 1024, content: mark({}), scale: 0.62 }) },
  { file: 'android-icon-background.png', size: 1024, transparent: false,
    svg: svg({ size: 1024, background: '<rect width="120" height="120" fill="url(#g)"/>', content: '' }) },
  { file: 'android-icon-monochrome.png', size: 1024, transparent: true,
    svg: svg({ size: 1024, content: mark({ ball: '#FFFFFF', dots: false }), scale: 0.62 }) },
  // Splash: mark on its own (the splash background colour is set in app.json).
  { file: 'splash-icon.png', size: 1024, transparent: true,
    svg: svg({ size: 1024, content: mark({}), scale: 0.9 }) },
  { file: 'favicon.png', size: 96, transparent: false,
    svg: svg({ size: 96, background: '<rect width="120" height="120" rx="26" fill="url(#g)"/>', content: mark({}), scale: 0.86 }) },
];

for (const variant of variants) {
  const html = join(WORK, variant.file + '.html');
  writeFileSync(html, `<html><body style="margin:0;background:transparent">${variant.svg}</body></html>`);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${variant.size},${variant.size}`,
    '--default-background-color=00000000',
    `--screenshot=${join(OUT, variant.file)}`,
    'file:///' + html.replaceAll('\\', '/'),
  ], { stdio: 'ignore' });
  console.log('wrote', variant.file);
}
