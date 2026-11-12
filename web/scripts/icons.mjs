// Makes the phone-app icons in public/ from the logo mark (run again if the logo changes):
//   node scripts/icons.mjs
// icon-192/512: the mark on its own rounded tile. icon-maskable-512: full-bleed, with the mark
// inside the safe circle so Android can cut it to any shape. apple-touch-icon: 180 px, square.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const INK = "#171b24", SURFACE = "#ffffff", CORAL = "#ff704f";
const mark = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="100%" height="100%">
  <rect width="40" height="40" fill="${INK}"/>
  <g transform="translate(${pad} ${pad}) scale(${(40 - 2 * pad) / 40})">
    <path d="M13 10.5v19h6.5a9.5 9.5 0 0 0 0-19H13Z" fill="none" stroke="${SURFACE}" stroke-width="3.6" stroke-linejoin="round"/>
    <circle cx="19.6" cy="20" r="3.4" fill="${CORAL}"/>
  </g></svg>`;
const out = [["icon-192.png", 192, 2], ["icon-512.png", 512, 2], ["icon-maskable-512.png", 512, 7], ["apple-touch-icon.png", 180, 4]];
const b = await chromium.launch(); const p = await b.newPage();
for (const [name, size, pad] of out) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0">${mark(pad)}</body></html>`);
  await p.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: false });
}
await b.close(); console.log("icons written");
