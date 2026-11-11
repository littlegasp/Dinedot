import { CheckCheck, ChefHat, CircleDashed, Flame, BellRing, Receipt, Utensils } from "lucide-react";
import { Badge } from "./primitives";
import type { LiveTable, LiveVisit } from "@/lib/types";

/** A table's state, worked out from its open visit. Every status shows a word and an icon. */
export type TableState = "free" | "ordered" | "food" | "bill";
export const TABLE_STATE: Record<TableState, { label: string; tone: "neutral" | "warning" | "success" | "coral"; Icon: typeof Receipt }> = {
  free: { label: "Free", tone: "neutral", Icon: CircleDashed },
  ordered: { label: "Ordered", tone: "warning", Icon: ChefHat },
  food: { label: "Eating", tone: "success", Icon: Utensils },
  bill: { label: "Bill asked", tone: "coral", Icon: Receipt },
};
export function tableState(v: LiveVisit | undefined): TableState {
  if (!v) return "free";
  if (v.status === "bill") return "bill";
  return v.orders.some(o => o.status === "new" || o.status === "cooking") ? "ordered" : "food";
}
export const visitOf = (t: LiveTable, visits: LiveVisit[]) => visits.find(v => v.table_id === t.id && v.status !== "paid");
/** How a bill is named on screen: its table number, or "Token 12" for takeaway. */
export const visitLabel = (v: Pick<LiveVisit, "table_id" | "token">, tables: LiveTable[]) =>
  v.table_id ? (tables.find(t => t.id === v.table_id)?.code ?? "") : `Token ${v.token}`;

export function TableStatus({ state }: { state: TableState }) {
  const s = TABLE_STATE[state];
  return <Badge tone={s.tone}><s.Icon aria-hidden />{s.label}</Badge>;
}

export const TICKET_STATE = {
  new: { label: "New", tone: "coral" as const, Icon: BellRing },
  cooking: { label: "Cooking", tone: "warning" as const, Icon: Flame },
  ready: { label: "Ready", tone: "success" as const, Icon: CheckCheck },
};
export function TicketStatus({ status }: { status: keyof typeof TICKET_STATE }) {
  const s = TICKET_STATE[status];
  return <Badge tone={s.tone}><s.Icon aria-hidden />{s.label}</Badge>;
}
