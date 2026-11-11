"use client";
/* Orders sent while the connection is down wait here (this device only) and go out by
   themselves when it is back. Each keeps its request id, so the database saves it once even
   if a send is repeated (orders.request_id, 0003). Only orders wait; payments never do,
   because money must be confirmed by the database there and then. */
import * as React from "react";
import { ApiError, rpc } from "./api";

export type Job = { id: string; fn: "staff_add_order" | "staff_takeaway_order"; args: Record<string, unknown>; label: string; restaurant: string; at: string };
const KEY = "dineos.outbox";
const EVT = "dineos-outbox";

const read = (): Job[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const write = (j: Job[]) => { try { localStorage.setItem(KEY, JSON.stringify(j)); } catch { /* storage full or blocked */ } window.dispatchEvent(new Event(EVT)); };

export const isOffline = (e: unknown) => e instanceof ApiError && !!e.offline;
export function enqueue(job: Job) { write([...read().filter(j => j.id !== job.id), job]); }

let flushing = false;
/** Sends waiting orders oldest first. Stops at the first one that still can't reach the server. */
export async function flush(restaurant: string, report: (msg: string, ok: boolean) => void) {
  if (flushing) return; flushing = true;
  try {
    for (const job of read().filter(j => j.restaurant === restaurant)) {
      try {
        const r = await rpc<{ token?: number }>(job.fn, job.args);
        write(read().filter(j => j.id !== job.id));
        report(`Sent to the kitchen · ${job.fn === "staff_takeaway_order" && r?.token ? `Token ${r.token}` : job.label} (saved while offline)`, true);
      } catch (e) {
        if (isOffline(e)) break;
        // the database refused it (sold out, closed day…): drop it and say why
        write(read().filter(j => j.id !== job.id));
        report(`${job.label}: this order couldn't be sent. ${(e as Error).message}`, false);
      }
    }
  } finally { flushing = false; }
}

/** Waiting orders for this restaurant; retries when the connection comes back and every 15 s. */
export function useOutbox(restaurant: string | null | undefined, report: (msg: string, ok: boolean) => void) {
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const rep = React.useRef(report); rep.current = report;
  React.useEffect(() => {
    if (!restaurant) return;
    const sync = () => setJobs(read().filter(j => j.restaurant === restaurant));
    const go = () => { if (navigator.onLine) flush(restaurant, (m, ok) => rep.current(m, ok)); };
    sync(); go();
    window.addEventListener(EVT, sync); window.addEventListener("storage", sync); window.addEventListener("online", go);
    const t = setInterval(go, 15_000);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); window.removeEventListener("online", go); clearInterval(t); };
  }, [restaurant]);
  return { jobs, retry: () => restaurant && flush(restaurant, (m, ok) => rep.current(m, ok)) };
}
