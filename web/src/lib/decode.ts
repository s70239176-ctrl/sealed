/**
 * Pure decoding: contract view dictionaries -> typed objects, and contract refusals -> plain language.
 * No network, no environment: unit-tested in node.
 */
import type { Bid, BidSource, BidStatus, Criterion, DryRunResult, LintResult, Outcome, Receipt, Recheck, Rfp, RfpStatus, RfpSummary } from "./types.ts";

/** genlayer-js may hand back Maps for contract dicts; normalise to plain objects (bigints kept). */
export function plain(v: unknown): unknown {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object" && !(v instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

export type Raw = Record<string, unknown>;
const big = (v: unknown): bigint => BigInt(v as never);
const num = (v: unknown): number => Number(v);
const addr = (v: unknown): string => String(v).toLowerCase();
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pair = (r: unknown): { bidId: number; amount: bigint } => ({ bidId: num((r as Raw).bid_id), amount: big((r as Raw).amount) });

export function toRfp(r: Raw): Rfp {
  return {
    id: num(r.id),
    sponsor: addr(r.sponsor),
    title: String(r.title),
    criteria: list(r.criteria) as Criterion[],
    criteriaHash: String(r.criteria_hash),
    tieRule: String(r.tie_rule) as "lowest" | "split",
    pool: big(r.pool),
    bond: big(r.bond),
    bidDeadline: num(r.bid_deadline),
    revealDeadline: num(r.reveal_deadline),
    createdAt: num(r.created_at),
    status: String(r.status) as RfpStatus,
    outcome: String(r.outcome) as Outcome,
    bidIds: list(r.bid_ids).map(num),
    winners: list(r.winners).map(pair),
    returned: list(r.returned).map(pair),
    forfeited: big(r.forfeited ?? 0),
    settledAt: num(r.settled_at),
  };
}

function toRecheck(r: unknown): Recheck | null {
  if (!r || typeof r !== "object") return null;
  const x = r as Raw;
  return { count: num(x.count), matches: Boolean(x.matches), at: num(x.at), source: String(x.source) as BidSource };
}

export function toBid(r: Raw): Bid {
  return {
    id: num(r.id),
    rfpId: num(r.rfp_id),
    bidder: addr(r.bidder),
    url: String(r.url),
    priceCommit: String(r.price_commit),
    contentHash: String(r.content_hash),
    bond: big(r.bond),
    price: r.price === null || r.price === undefined ? null : big(r.price),
    status: String(r.status) as BidStatus,
    source: r.source ? (String(r.source) as BidSource) : null,
    bits: Array.isArray(r.bits) ? (r.bits as unknown[]).map(Boolean) : null,
    eligible: r.eligible === null || r.eligible === undefined ? null : Boolean(r.eligible),
    attempts: num(r.attempts ?? 0),
    createdAt: num(r.created_at),
    recheck: toRecheck(r.recheck),
  };
}

export function toSummary(r: Raw): RfpSummary {
  return {
    id: num(r.id),
    title: String(r.title),
    pool: big(r.pool),
    bond: big(r.bond),
    status: String(r.status) as RfpStatus,
    outcome: String(r.outcome) as Outcome,
    tieRule: String(r.tie_rule) as "lowest" | "split",
    bidDeadline: num(r.bid_deadline),
    revealDeadline: num(r.reveal_deadline),
    bidCount: num(r.bid_count),
    criteriaCount: num(r.criteria_count),
  };
}

export function toReceipt(r: Raw): Receipt {
  return { rfp: toRfp(r.rfp as Raw), bids: list(r.bids).map((b) => toBid(b as Raw)) };
}

export function toLint(r: Raw): LintResult {
  return {
    ok: Boolean(r.ok),
    reason: String(r.reason ?? ""),
    criteria: list(r.criteria) as Criterion[],
    hash: String(r.hash ?? ""),
    warnings: list(r.warnings).map((w) => ({ index: num((w as Raw).index), warning: String((w as Raw).warning) })),
  };
}

export function toDryRun(r: Raw): DryRunResult {
  return {
    ok: Boolean(r.ok),
    reason: String(r.reason ?? ""),
    bits: list(r.bits).map((b) => (b === null || b === undefined ? null : Boolean(b))),
    pageHash: String(r.page_hash ?? ""),
  };
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The contract's own refusal text: base64 (tag byte + utf-8) in a dry-run error or a leader receipt. */
export function decodeRevert(payload: unknown): string | undefined {
  if (typeof payload !== "string" || payload === "") return undefined;
  try {
    const bytes = fromB64(payload);
    const text = new TextDecoder().decode(bytes.subarray(bytes[0] !== undefined && bytes[0] <= 8 ? 1 : 0));
    return /^[\x20-\x7e]{1,80}$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

export const REFUSALS: Record<string, string> = {
  "empty pool": "Attach some GEN: the prize pool cannot be empty.",
  "bad title": "The title must be 1 to 120 characters.",
  "bad tie rule": "The award rule must be 'lowest' or 'split'.",
  "bad criteria": "Add between 1 and 8 criteria.",
  "bad criterion": "One of the criteria is malformed, or its text is empty or longer than 200 characters.",
  "criterion needs taste": "A question must be a yes/no fact about the page, ending in '?'. Words like best, good, clear or quality ask for taste, which a jury cannot agree on.",
  "no page criterion": "A price ceiling alone cannot judge a bid. Add at least one criterion about the page.",
  "bad deadline": "The bidding deadline must be in the future and at most 90 days out.",
  "bad reveal window": "The reveal window must be between 1 minute and 14 days.",
  "bad bond": "The bond must be at least 1 and no more than the prize pool.",
  "bidding closed": "Bidding on this RFP has closed.",
  "sponsor cannot bid": "The sponsor of an RFP cannot bid on it.",
  "bad url": "That is not an acceptable public https URL (no credentials, ports, IP addresses or local hosts).",
  "bad commitment": "The price commitment must be 64 lowercase hex characters.",
  "bad page hash": "The page fingerprint must be 64 lowercase hex characters.",
  "bond mismatch": "Attach exactly this RFP's bond.",
  "already bid": "This wallet has already bid on this RFP.",
  "bid limit": "This RFP already has the maximum number of bids.",
  "unknown rfp": "That RFP does not exist.",
  "unknown bid": "That bid does not exist.",
  "not your bid": "Only the wallet that placed the bid can reveal its price.",
  "bidding still open": "Prices can only be revealed after bidding closes.",
  "reveal closed": "The reveal window has closed. An unrevealed bid is ineligible.",
  "already revealed": "This price is already revealed.",
  "bad reveal": "Enter a price of at least 1 and the secret word you used.",
  "commitment mismatch": "That price and secret word do not match what was sealed. Use exactly what you entered when you bid.",
  "reveal window open": "Evaluation and settlement start when the reveal window closes.",
  "not revealed": "This bid never revealed its price, so it is ineligible and is not sent to the jury.",
  "already evaluated": "This bid has already been evaluated.",
  "retry too soon": "The bid page could not be loaded last time. Retries are spaced apart; try again later.",
  "bad judgment": "The jury returned something unusable. Nothing moved; try again.",
  "bids awaiting evaluation": "Every revealed bid must be evaluated before the RFP can settle.",
  "already settled": "This RFP is already settled.",
  "not evaluated": "Only an evaluated bid can be re-checked.",
};

/** Refusals that depend on the clock; a dry run may see a stale time, so they never block a send. */
export const TIME_DEPENDENT = new Set([
  "bad deadline",
  "bidding closed",
  "bidding still open",
  "reveal closed",
  "reveal window open",
  "retry too soon",
  "bids awaiting evaluation",
]);

export function describeError(e: unknown): string {
  const cause = (e as { cause?: { data?: { receipt?: { result?: unknown } } } })?.cause;
  const decoded = decodeRevert(cause?.data?.receipt?.result);
  if (decoded) return REFUSALS[decoded] ?? decoded;
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied|4001/i.test(msg)) return "You declined the request in your wallet.";
  return msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
}

/** The raw refusal key (e.g. "bad url") behind an error, if the contract produced one. */
export function refusalKey(e: unknown): string | undefined {
  const cause = (e as { cause?: { data?: { receipt?: { result?: unknown } } } })?.cause;
  return decodeRevert(cause?.data?.receipt?.result);
}
