"use client";

import { useRef, useState } from "react";
import { CircleDollarSign, RefreshCw, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { YuuFeedback, YuuPanelTitle } from "@/components/yuu/primitives";
import { type MockPaymentIntent, yuuApi } from "@/lib/client/yuu-api";

export function MockPaymentPanel({ open, onOpenChange, listing }: { open: boolean; onOpenChange: (open: boolean) => void; listing: { id: string | number; title: string } | null }) {
  const [intent, setIntent] = useState<MockPaymentIntent | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const keyRef = useRef("");

  const start = async () => {
    if (!listing) return;
    setPending(true);
    setError("");
    try {
      if (!keyRef.current) keyRef.current = crypto.randomUUID();
      const response = await yuuApi.startMockPayment(listing.id, keyRef.current);
      setIntent(response.intent);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the payment simulation.");
    } finally {
      setPending(false);
    }
  };

  const update = async (status?: "succeeded" | "failed" | "canceled") => {
    if (!intent) return;
    setPending(true);
    setError("");
    try {
      const response = status ? await yuuApi.simulateMockPayment(intent.id, status) : await yuuApi.mockPayment(intent.id);
      setIntent(response.intent);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the simulation.");
    } finally {
      setPending(false);
    }
  };

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="yuu-service-panel sm:max-w-[500px]" side="right">
      <YuuPanelTitle title="Payment simulation" description={listing?.title || "Review a sample payment flow."} />
      <div className="yuu-panel-scroll">
        <div className="yuu-context-note"><ShieldCheck size={20} /><span>Mock provider only. No card details are collected and no money is charged.</span></div>
        {intent ? <div className="yuu-payment-state">
          <div className="yuu-payment-amount"><span>Simulated amount</span><strong>฿{(intent.amountMinor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong><small>{intent.currency} · no live charge</small></div>
          <div className="yuu-payment-status"><span>Status</span><strong className={`status-${intent.status}`}>{intent.status}</strong></div>
          <div className="yuu-payment-actions"><button disabled={pending} onClick={() => void update()}><RefreshCw size={16} /> Refresh status</button>{intent.status === "pending" && <><button disabled={pending} onClick={() => void update("succeeded")}>Simulate success</button><button disabled={pending} onClick={() => void update("failed")}>Simulate failure</button><button disabled={pending} onClick={() => void update("canceled")}>Cancel simulation</button></>}</div>
          {intent.status === "succeeded" && <YuuFeedback>Simulation completed. This is not a booking or real payment.</YuuFeedback>}
        </div> : <div className="yuu-payment-intro"><CircleDollarSign size={28} /><h3>Explore the payment flow</h3><p>The server calculates the amount from confirmed rent, deposit and fees. This only creates a test intent.</p><button className="yuu-panel-primary" disabled={pending || !listing} onClick={() => void start()}>{pending ? "Starting…" : "Start simulation"}</button></div>}
        {error && <YuuFeedback kind="error">{error}</YuuFeedback>}
      </div>
    </SheetContent>
  </Sheet>;
}
