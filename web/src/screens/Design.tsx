"use client";
import { Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Diet, EmptyState, Field, Input, Kbd, Skeleton } from "@/components/ui/primitives";
import { TableStatus, TicketStatus } from "@/components/ui/status";
import { LogoMark } from "@/components/brand/Logo";

const SWATCHES = [
  ["Ink", "--ink"], ["Coral", "--coral"], ["Coral text", "--coral-strong"], ["Blue", "--blue"], ["Background", "--background"], ["Surface", "--surface"],
  ["Muted", "--surface-muted"], ["Border", "--border"], ["Text", "--text"], ["Secondary", "--text-secondary"], ["Success", "--success"], ["Warning", "--warning"], ["Danger", "--danger"],
];

export function DesignScreen() {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Colour" sub="Every colour is a token with a light and a dark value. Switch the theme at the top to compare." />
        <div className="grid grid-cols-3 gap-3 px-5 pb-5 sm:grid-cols-5 xl:grid-cols-7">
          {SWATCHES.map(([n, v]) => (
            <div key={v}><div className="h-14 rounded-[var(--radius)] border border-border" style={{ background: `var(${v})` }} /><p className="mt-1.5 text-[12px] font-semibold text-fg">{n}</p><p className="font-mono text-[11px] text-fg-2">{v}</p></div>
          ))}
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Type" sub="Manrope for headings and numbers, Inter for everything else" />
          <div className="grid gap-2 px-5 pb-5">
            <p className="font-display text-[30px] font-extrabold leading-tight text-fg">Today · ₹71,900</p>
            <p className="font-display text-xl font-bold text-fg">Table T4 asked for the bill</p>
            <p className="text-sm text-fg">Body text is Inter 14 px. Labels stay short and use the words staff already say.</p>
            <p className="text-[13px] text-fg-2">Secondary text for hints and timestamps.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Buttons" sub="Coral is for the one main action on a screen" />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            <Button variant="primary"><Plus />Take payment</Button><Button variant="ink">Send</Button><Button>Secondary</Button>
            <Button variant="blue">Add UPI</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Void bill</Button><Button disabled>Disabled</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Status" sub="Always a word and an icon, never colour alone" />
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {(["free", "seated", "ordered", "food", "bill", "cleaning"] as const).map(s => <TableStatus key={s} state={s} />)}
            {(["new", "cooking", "ready"] as const).map(s => <TicketStatus key={s} status={s} />)}
            <Badge><Diet diet="veg" />Veg</Badge><Badge><Diet diet="nonveg" />Non-veg</Badge><Badge><Diet diet="egg" />Egg</Badge>
          </div>
        </Card>
        <Card>
          <CardHeader title="Fields, loading and empty" />
          <div className="grid gap-4 px-5 pb-5">
            <Field label="Restaurant name" hint="Shown on the guest page and receipts"><Input defaultValue="The Copper Pot" /></Field>
            <div className="flex items-center gap-2 text-[13px] text-fg-2">Search anywhere with <Kbd>Ctrl</Kbd><Kbd>K</Kbd></div>
            <div className="grid gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
            <div className="rounded-[var(--radius)] border border-dashed border-border"><EmptyState icon={<Inbox />} title="No open bills" body="Bills appear here as soon as a table orders." /></div>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Mark" sub="A geometric D with a live dot. Works from 16 px to the app icon." />
          <div className="flex items-end gap-5 px-5 pb-5"><LogoMark size={64} /><LogoMark size={40} /><LogoMark size={24} /><LogoMark size={16} /></div>
        </Card>
      </div>
    </div>
  );
}
