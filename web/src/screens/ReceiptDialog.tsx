"use client";
/* Bill preview with Print and Share. Staff open it by visit id (staff_receipt); the guest page
   passes the receipt it already has from guest_state. */
import * as React from "react";
import { Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { Dialog, toast } from "@/components/ui/overlay";
import { rpc } from "@/lib/api";
import { printReceipt, receiptHtml, receiptTitle, shareReceipt, type Receipt } from "@/lib/receipt";

export function ReceiptDialog({ open, onOpenChange, visitId, receipt, canPrint = true }:
  { open: boolean; onOpenChange: (o: boolean) => void; visitId?: string | null; receipt?: Receipt | null; canPrint?: boolean }) {
  const [r, setR] = React.useState<Receipt | null>(receipt ?? null);
  const [h, setH] = React.useState(420);
  React.useEffect(() => {
    if (!open) return;
    if (receipt) { setR(receipt); return; }
    if (!visitId) return;
    setR(null);
    rpc<Receipt>("staff_receipt", { p_visit: visitId }).then(setR).catch(e => { toast((e as Error).message, "error"); onOpenChange(false); });
  }, [open, visitId, receipt, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={r ? `${receiptTitle(r)}${r.invoice_no ? ` · ${r.invoice_no}` : ""}` : "Bill"}
      description={r ? (r.status === "paid" ? "The bill as it prints on the receipt printer." : "A bill to show the guest before they pay. It has no bill number yet.") : undefined}>
      {!r ? <Skeleton className="h-96" /> : <>
        <div className="max-h-[55dvh] overflow-auto rounded-[var(--radius)] border border-border bg-white p-2">
          <iframe title="Bill preview" srcDoc={receiptHtml(r)} className="mx-auto block w-full max-w-[340px] border-0" style={{ height: h }}
            onLoad={e => { const d = e.currentTarget.contentDocument; if (d) setH(d.documentElement.scrollHeight + 8); }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {canPrint && <Button size="lg" variant="ink" onClick={() => printReceipt(r)}><Printer />Print</Button>}
          <Button size="lg" className={canPrint ? "" : "col-span-2"} onClick={() => shareReceipt(r)}><Share2 />Share</Button>
        </div>
        {!r.place.gstin && r.bill.gst > 0 && canPrint && <p className="mt-3 text-[12px] text-fg-2">Add your GSTIN in Settings → Bills so this prints as a tax invoice.</p>}
      </>}
    </Dialog>
  );
}
