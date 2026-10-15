export type CriterionKind = "contains" | "license" | "price_max" | "deliverable" | "question";

export type Criterion =
  | { kind: "contains"; text: string }
  | { kind: "license"; allowed: string[] }
  | { kind: "price_max"; max: number }
  | { kind: "deliverable"; prefix: string }
  | { kind: "question"; text: string };

export type RfpStatus = "OPEN" | "SETTLED";
export type Outcome = "" | "PAID" | "SPLIT" | "REFUNDED";
export type BidStatus = "COMMITTED" | "REVEALED" | "EVALUATED";
export type BidSource = "ok" | "unavailable" | "changed";

export interface Rfp {
  id: number;
  sponsor: string;
  title: string;
  criteria: Criterion[];
  criteriaHash: string;
  tieRule: "lowest" | "split";
  pool: bigint;
  bond: bigint;
  bidDeadline: number;
  revealDeadline: number;
  createdAt: number;
  status: RfpStatus;
  outcome: Outcome;
  bidIds: number[];
  winners: { bidId: number; amount: bigint }[];
  returned: { bidId: number; amount: bigint }[];
  forfeited: bigint;
  settledAt: number;
}

export interface Recheck {
  count: number;
  matches: boolean;
  at: number;
  source: BidSource;
}

export interface Bid {
  id: number;
  rfpId: number;
  bidder: string;
  url: string;
  priceCommit: string;
  contentHash: string;
  bond: bigint;
  /** null while the price is still sealed */
  price: bigint | null;
  status: BidStatus;
  source: BidSource | null;
  bits: boolean[] | null;
  eligible: boolean | null;
  attempts: number;
  createdAt: number;
  recheck: Recheck | null;
}

export interface RfpSummary {
  id: number;
  title: string;
  pool: bigint;
  bond: bigint;
  status: RfpStatus;
  outcome: Outcome;
  tieRule: "lowest" | "split";
  bidDeadline: number;
  revealDeadline: number;
  bidCount: number;
  criteriaCount: number;
}

export interface Receipt {
  rfp: Rfp;
  bids: Bid[];
}

export interface Page<T> {
  total: number;
  items: T[];
}

export interface LintResult {
  ok: boolean;
  reason: string;
  criteria: Criterion[];
  hash: string;
  warnings: { index: number; warning: string }[];
}

export interface DryRunResult {
  ok: boolean;
  reason: string;
  /** null = needs the network or the jury, so a dry run cannot answer */
  bits: (boolean | null)[];
  pageHash: string;
}

export type Phase = "signing" | "pending" | "accepted" | "finalized";

export interface TxOutcome {
  hash: string;
  status: string;
  /** Plain-language reason when the transaction did not settle or the contract refused it. */
  error?: string;
  /** The string a successful call returned (evaluate_bid: "eligible" ...; settle: "PAID" ...). */
  result?: string;
  /** For payable calls that return {ok, id}: the new id. */
  id?: number;
}

/** The clock-driven stage of an RFP, derived from its two deadlines. */
export type Stage = "bidding" | "reveal" | "evaluation" | "settled";
