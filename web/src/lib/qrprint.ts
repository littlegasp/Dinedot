/* QR cards for the tables, printed from a hidden frame (like the bill in receipt.ts): only the
   cards go to the printer, never the app, the browser's own page or anything a browser extension
   adds to the page. A4, 3 × 3 cards per sheet, each with a dashed line to cut along. */
import qrcode from "qrcode-generator";
import { BRAND } from "./brand";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const LOGO = `<svg width="22" height="22" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#171b24"/><path d="M13 10.5v19h6.5a9.5 9.5 0 0 0 0-19H13Z" fill="none" stroke="#fff" stroke-width="3.6" stroke-linejoin="round"/><circle cx="19.6" cy="20" r="3.4" fill="#ff704f"/></svg>`;

export type QrCard = { code: string; name?: string; url: string };

export function qrCardsHtml(place: string, cards: QrCard[]): string {
  const card = (c: QrCard) => {
    const q = qrcode(0, "M"); q.addData(c.url); q.make();   // margin 3: the white edge phones need to read it
    return `<div class="card">
      <div class="place">${LOGO}<span>${esc(place)}</span></div>
      <div class="qr">${q.createSvgTag({ cellSize: 4, margin: 3, scalable: true })}</div>
      <div class="code">${esc(c.code)}</div>
      ${c.name ? `<div class="name">${esc(c.name)}</div>` : ""}
      <p>Scan to see the menu, order and pay.<br>No app or sign-up needed.</p>
    </div>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(place)} · QR codes</title><style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #171b24; font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
    .card { break-inside: avoid; page-break-inside: avoid; height: 88mm; border: 0.3mm dashed #b8bec8; border-radius: 4mm;
      padding: 5mm 4mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .place { display: flex; align-items: center; gap: 2mm; font-weight: 800; font-size: 10.5pt; max-width: 100%; }
    .place span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qr { width: 44mm; height: 44mm; margin: 4mm 0 3mm; }
    .qr svg { width: 100%; height: 100%; display: block; }
    .code { font-weight: 800; font-size: 24pt; line-height: 1; }
    .name { font-size: 9.5pt; font-weight: 600; margin-top: 1mm; }
    p { margin: 2.5mm 0 0; font-size: 8pt; line-height: 1.35; color: #3a404c; }
  </style></head><body><div class="sheet">${cards.map(card).join("")}</div></body></html>`;
}

/** Opens the print dialog for the cards only. */
export function printQrCards(place: string, cards: QrCard[]) {
  if (!cards.length) return;
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  f.srcdoc = qrCardsHtml(place || BRAND.name, cards);
  f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); };
  document.body.appendChild(f);
}
