import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Display money. Authoritative amounts always come from the database; this only formats. */
export function inr(n: number, opts: { paise?: boolean } = {}): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: opts.paise ? 2 : 0, maximumFractionDigits: opts.paise ? 2 : 0,
  }).format(n);
}

export const minsAgo = (m: number) => (m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
