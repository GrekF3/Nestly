import { ShieldCheck } from "lucide-react";
import type { ListingTrust } from "@/lib/client/yuu-api";

export function ListingTrustPassport({ listingId, trust, error }: { listingId: string | number; trust: ListingTrust | null; error: string }) {
  const current = trust?.listingId === listingId ? trust : null;
  return <section className="yuu-trust-passport"><h3><ShieldCheck size={19} /> Home trust passport</h3>{current ? <><p className={current.verified ? "passport-verified" : "passport-pending"}>{current.verified ? "All listing checks passed" : "Checks are still in progress"}</p>{current.checks.map((check) => <div key={check.kind} className="passport-check"><span>{check.kind.replace(/_/g, " ")}</span><strong className={check.status === "passed" ? "passed" : ""}>{check.status}</strong>{check.publicNote && <small>{check.publicNote}</small>}</div>)}</> : <p className="passport-pending">{error || "Loading evidence and review status…"}</p>}</section>;
}

export function DepositReturnChecklist() {
  return <section className="yuu-deposit-checklist"><h3>Protect your deposit</h3><ol><li>Photograph each room and record existing damage at move-in.</li><li>Keep receipts and the signed inventory with your lease.</li><li>Confirm the return timeline and document the final inspection.</li></ol></section>;
}

type Cost = {
  price: number;
  depositMonths: number;
  deposit: string;
  oneTimeFeesTHB: number | null;
  recurringFeesTHB: number | null;
  agentFeeTHB: number | null;
};

const thb = (amount: number) => new Intl.NumberFormat("en-US").format(amount);

export function knownMoveInSubtotal(cost: Cost) {
  return cost.price * (1 + cost.depositMonths) + (cost.oneTimeFeesTHB || 0) + (cost.agentFeeTHB || 0);
}

export function ListingCostBreakdown({ cost, trust }: { cost: Cost; trust: ListingTrust | null }) {
  const allFeesConfirmed = trust?.cost.allFeesConfirmed || [cost.oneTimeFeesTHB, cost.recurringFeesTHB, cost.agentFeeTHB].every((amount) => amount !== null);
  return <section className="cost-card"><div className="cost-heading"><div><span>Monthly rent</span><strong>฿{thb(cost.price)}</strong></div><span>{cost.deposit}</span></div><div className="cost-breakdown"><span>First month <strong>฿{thb(cost.price)}</strong></span><span>Security deposit <strong>฿{thb(cost.price * cost.depositMonths)}</strong></span><span>One-time fees <strong>{cost.oneTimeFeesTHB == null ? "To confirm" : `฿${thb(cost.oneTimeFeesTHB)}`}</strong></span><span>Agent fee <strong>{cost.agentFeeTHB == null ? "To confirm" : `฿${thb(cost.agentFeeTHB)}`}</strong></span><span>Recurring extras <strong>{cost.recurringFeesTHB == null ? "To confirm" : `฿${thb(cost.recurringFeesTHB)} / month`}</strong></span></div><div className="move-in-total"><span>{allFeesConfirmed ? "Total to move in" : "Known move-in subtotal"}</span><strong>฿{thb(trust?.cost.knownMoveInSubtotalTHB ?? knownMoveInSubtotal(cost))}</strong></div></section>;
}
