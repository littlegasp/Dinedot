import { Armchair, BellRing, CheckCheck, ChefHat, CircleDashed, Flame, Receipt, Sparkles, Utensils } from "lucide-react";
import { Badge } from "./primitives";
import type { TableState } from "@/lib/mock";

/** Every status shows a word and an icon, never colour alone. */
export const TABLE_STATE: Record<TableState, { label: string; tone: "neutral" | "blue" | "warning" | "success" | "coral" | "ink"; Icon: typeof Armchair }> = {
  free: { label: "Free", tone: "neutral", Icon: CircleDashed },
  seated: { label: "Seated", tone: "blue", Icon: Armchair },
  ordered: { label: "Ordered", tone: "warning", Icon: ChefHat },
  food: { label: "Eating", tone: "success", Icon: Utensils },
  bill: { label: "Bill asked", tone: "coral", Icon: Receipt },
  cleaning: { label: "Cleaning", tone: "neutral", Icon: Sparkles },
};

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
