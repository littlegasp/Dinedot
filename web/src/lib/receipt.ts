/* The printed bill (GST rule 46): built as a small HTML page and printed from a hidden frame,
   so it gets its own paper size (58 or 80 mm thermal roll) and never mixes with the app's pages.
   Every amount comes from the database (receipt_json); this file only lays it out. */
import type { Bill, PayMethod } from "./types";

export type Receipt = {
  place: { name: string; legal_name: string; address: string; gstin: string; fssai: string; sac: string; composition: boolean; footer: string; width: 58 | 80; currency: string };
  status: "open" | "bill" | "paid" | "void"; invoice_no: string | null; at: string; opened_at: string;
  label: string; kind: "dine_in" | "takeaway"; guests: number | null; by?: string | null;
  lines: { name: string; size: string; addons: string[]; qty: number; amount: number; unit: number }[];
  bill: Bill; taxable: number; cgst: number; sgst: number;
  payments: { method: PayMethod; amount: number; reference: string }[];
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHOD: Record<string, string> = { upi: "UPI", card: "Card", cash: "Cash", mixed: "Split" };

/** What the paper is called: a tax invoice when GST is charged, a bill of supply on the composition scheme. */
export function receiptTitle(r: Receipt) {
  if (r.status !== "paid") return "Bill (not paid yet)";
  if (r.place.composition) return "Bill of supply";
  return r.place.gstin && r.bill.gst > 0 ? "Tax invoice" : "Bill";
}

export function receiptHtml(r: Receipt): string {
  const b = r.bill, p = r.place, w = p.width === 58 ? 58 : 80;
  const half = (b.gst_pct || 0) / 2;
  const roundOff = Math.round(((b.total) - (r.taxable + (b.gst || 0))) * 100) / 100;
  const when = new Date(r.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const row = (k: string, v: string, cls = "") => `<tr class="${cls}"><td>${k}</td><td class="r">${v}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.invoice_no ?? "Bill")}</title><style>
  @page { size: ${w}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: ${w === 58 ? "3mm 2.5mm" : "4mm"}; width: ${w}mm; font: ${w === 58 ? 10 : 12}px/1.35 ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace; color: #000; background: #fff; }
  h1 { font-size: 1.35em; margin: 0; text-align: center; } p { margin: 0; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; } .b { font-weight: 700; } .s { font-size: .9em; }
  .t { margin: 2mm 0 1mm; text-align: center; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1mm 0; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: .3mm 0; vertical-align: top; } td + td, th + th { padding-left: 2.5mm; } th { text-align: left; font-weight: 700; border-bottom: 1px dashed #000; }
  .line td { border-top: 1px dashed #000; padding-top: 1mm; } .big td { font-size: 1.25em; font-weight: 700; }
  hr { border: 0; border-top: 1px dashed #000; margin: 1.5mm 0; }
</style></head><body>
  <h1>${esc(p.name)}</h1>
  ${p.legal_name && p.legal_name !== p.name ? `<p class="c s">${esc(p.legal_name)}</p>` : ""}
  ${p.address ? `<p class="c s">${esc(p.address)}</p>` : ""}
  ${p.gstin ? `<p class="c s">GSTIN: ${esc(p.gstin)}</p>` : ""}
  ${p.fssai ? `<p class="c s">FSSAI Lic. No: ${esc(p.fssai)}</p>` : ""}
  <p class="t">${esc(receiptTitle(r))}</p>
  <table class="s">
    ${r.invoice_no ? row("Bill no", `<b>${esc(r.invoice_no)}</b>`) : ""}
    ${row("Date", esc(when))}
    ${row(r.kind === "takeaway" ? "Takeaway" : "Table", esc(r.label) + (r.guests ? ` · ${r.guests} guests` : ""))}
    ${r.by ? row("Cashier", esc(r.by)) : ""}
  </table>
  <hr>
  <table>
    <tr><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr>
    ${r.lines.map(l => `<tr><td>${esc(l.name)}${l.size ? ` (${esc(l.size)})` : ""}${l.addons?.length ? `<br><span class="s">+ ${esc(l.addons.join(", "))}</span>` : ""}${l.qty > 1 ? `<br><span class="s">@ ${money(l.unit)}</span>` : ""}</td><td class="r">${l.qty}</td><td class="r">${money(l.amount)}</td></tr>`).join("")}
  </table>
  <table>
    ${row("Items total", money(b.subtotal), "line")}
    ${(b.discount ?? 0) > 0 ? row(`Discount${b.discount_kind === "pct" ? ` ${b.discount_value}%` : ""}`, "-" + money(b.discount!)) : ""}
    ${b.service > 0 ? row(`Service charge ${b.service_pct}%`, money(b.service)) : ""}
    ${!p.composition && b.gst > 0 ? row("Taxable value", money(r.taxable)) + row(`CGST ${half}%`, money(r.cgst)) + row(`SGST ${half}%`, money(r.sgst)) : ""}
    ${Math.abs(roundOff) >= 0.01 ? row("Round off", (roundOff > 0 ? "+" : "") + money(roundOff)) : ""}
    ${row("Total", "₹" + money(b.total), "big line")}
    ${b.tip > 0 ? row(`${(b.tip_amount ?? 0) > 0 || !b.tip_pct ? "Tip" : `Tip ${b.tip_pct}%`} (not taxed)`, money(b.tip)) + row("Amount paid", "₹" + money(b.grand), "b") : ""}
  </table>
  ${r.payments.length ? `<hr><table class="s">${r.payments.map(x => row(`Paid by ${METHOD[x.method] ?? x.method}${x.reference ? ` · ${esc(x.reference)}` : ""}`, money(x.amount))).join("")}</table>` : ""}
  <hr>
  <p class="s">SAC ${esc(p.sac)} · Restaurant service</p>
  ${p.composition ? `<p class="s b">Composition taxable person, not eligible to collect tax on supplies.</p>` : ""}
  ${r.status !== "paid" ? `<p class="s b">This is not a tax invoice. Please pay at the counter or by UPI.</p>` : ""}
  ${p.footer ? `<p class="c" style="margin-top:2mm">${esc(p.footer)}</p>` : ""}
</body></html>`;
}

/** Prints the bill on the receipt printer (the browser's print dialog, paper set to the roll width). */
export function printReceipt(r: Receipt) {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  f.srcdoc = receiptHtml(r);
  f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); };
  document.body.appendChild(f);
}

/** A short text version for WhatsApp / the phone's share sheet. No phone number is asked for:
    the share sheet lets the guest or waiter pick who to send it to. */
export function receiptText(r: Receipt): string {
  const b = r.bill;
  return [
    `${r.place.name}${r.place.gstin ? ` (GSTIN ${r.place.gstin})` : ""}`,
    `${receiptTitle(r)}${r.invoice_no ? ` ${r.invoice_no}` : ""} · ${new Date(r.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`,
    ...r.lines.map(l => `${l.qty} × ${l.name}${l.size ? ` (${l.size})` : ""}: ₹${money(l.amount)}`),
    (b.discount ?? 0) > 0 ? `Discount: -₹${money(b.discount!)}` : "",
    b.gst > 0 ? `GST ${b.gst_pct}%: ₹${money(b.gst)}` : "",
    `Total: ₹${money(b.grand)}`,
    r.place.footer,
  ].filter(Boolean).join("\n");
}

export async function shareReceipt(r: Receipt) {
  const text = receiptText(r);
  if (navigator.share) { try { await navigator.share({ title: r.invoice_no ?? r.place.name, text }); return; } catch { /* closed the sheet */ return; } }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}
