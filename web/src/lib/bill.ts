/* Display mirror of the SQL bill (visit_bill). The database is the source of truth; the prototype
   uses the same order so the numbers on screen match what the real bill will say. */
export type Line = { id: string; dish: string; name: string; qty: number; price: number; mods?: string };

export function billOf(lines: Line[], opts: { servicePct?: number; gstPct?: number; discount?: number } = {}) {
  const service = opts.servicePct ?? 5, gst = opts.gstPct ?? 5;
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const discount = Math.min(opts.discount ?? 0, subtotal);
  const after = subtotal - discount;
  const serviceAmt = Math.round(after * service) / 100;
  const gstAmt = Math.round((after + serviceAmt) * gst) / 100;
  const raw = after + serviceAmt + gstAmt;
  const total = Math.round(raw);
  return { subtotal, discount, serviceAmt, gstAmt, roundOff: +(total - raw).toFixed(2), total, service, gst };
}
