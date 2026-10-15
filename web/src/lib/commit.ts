/**
 * Everything a bidder needs off-chain, computed exactly as the contract computes it.
 *
 *  - price commitment: sha256("<rfp id>|<bidder address, lower case>|<price>|<secret word>"), hex
 *  - page fingerprint: sha256 of the CLEANED page text (markup stripped, whitespace collapsed, first 20,000 characters)
 *
 * The contract's own `commitment_for` and `dry_run` views are the source of truth; this file mirrors them so a bid can
 * be prepared without a network round trip, and tests/vectors check both sides agree.
 */
export const PAGE_CHARS = 20000;

const TAG_RE = /<(script|style)(?![A-Za-z0-9_]).*?<\/\1[ \t\n\r\f\v]*>|<[^>]+>/gis;
const SPACE_RE = /[ \t\r\f\v]+/g;
const BLANKS_RE = /\n(?:[ \t\r\f\v]*\n)+/g;
const EDGE_RE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;

const codePoints = (s: string, n: number): string => {
  // Python slices by code point; JS strings are UTF-16, so truncate by code point as well.
  if (s.length <= n) return s;
  let out = "";
  let i = 0;
  for (const ch of s) {
    if (i++ >= n) break;
    out += ch;
  }
  return out;
};

/** Byte-for-byte the contract's `clean_page`. */
export function cleanPage(body: Uint8Array | string, limit = PAGE_CHARS): string {
  const text = typeof body === "string" ? body : new TextDecoder("utf-8", { ignoreBOM: true }).decode(body);
  const stripped = text.replace(TAG_RE, " ").replace(SPACE_RE, " ").replace(BLANKS_RE, "\n").replace(EDGE_RE, "");
  return codePoints(stripped, limit);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const pageHash = (cleaned: string) => sha256Hex(cleaned);

export function priceCommitment(rfpId: number, bidder: string, price: bigint | number, salt: string): Promise<string> {
  return sha256Hex(`${rfpId}|${bidder.toLowerCase()}|${price.toString()}|${salt}`);
}

export const isHash = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

/** A short, memorable secret word the bidder can also write down. */
export function newSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface PageFingerprint {
  hash: string;
  chars: number;
  text: string;
}

/** Fingerprint a page the bidder pastes (always works) ... */
export async function fingerprintText(raw: string): Promise<PageFingerprint> {
  const text = cleanPage(raw);
  if (text === "") throw new Error("That page is empty once markup is removed, so there is nothing to commit to.");
  return { hash: await pageHash(text), chars: [...text].length, text };
}

/** ... or fetch a public page the way a validator would. Browsers may refuse cross-origin reads. */
export async function fingerprintUrl(url: string, fetcher: typeof fetch = fetch): Promise<PageFingerprint> {
  let res: Response;
  try {
    res = await fetcher(url, { redirect: "follow", credentials: "omit" });
  } catch {
    throw new Error("This browser could not read that page (the site does not allow cross-origin reads). Paste the page source below instead.");
  }
  if (res.status !== 200) throw new Error(`That page answered HTTP ${res.status}. The jury needs a page that loads.`);
  return fingerprintText(new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer())));
}

// ------------------------------------------------------------------ this browser's memory of a bid
export interface BidMemory {
  price: string; // decimal wei
  salt: string;
  url: string;
  bidTx?: string;
  revealTx?: string;
}

const memKey = (contract: string, rfpId: number, bidder: string) => `sealed:${contract.toLowerCase()}:bid:${rfpId}:${bidder.toLowerCase()}`;

export function rememberBid(contract: string, rfpId: number, bidder: string, m: BidMemory): void {
  try {
    localStorage.setItem(memKey(contract, rfpId, bidder), JSON.stringify(m));
  } catch {
    /* private mode: the bidder must keep the secret word themselves, and the form says so */
  }
}

export function recallBid(contract: string, rfpId: number, bidder: string): BidMemory | null {
  try {
    const raw = localStorage.getItem(memKey(contract, rfpId, bidder));
    return raw ? (JSON.parse(raw) as BidMemory) : null;
  } catch {
    return null;
  }
}

export function patchBid(contract: string, rfpId: number, bidder: string, patch: Partial<BidMemory>): void {
  const cur = recallBid(contract, rfpId, bidder);
  if (cur) rememberBid(contract, rfpId, bidder, { ...cur, ...patch });
}

// ------------------------------------------------------------------ transaction hashes seen by this browser
const txKey = (contract: string, rfpId: number) => `sealed:${contract.toLowerCase()}:tx:${rfpId}`;

export function rememberTx(contract: string, rfpId: number, label: string, hash: string): void {
  try {
    const cur = JSON.parse(localStorage.getItem(txKey(contract, rfpId)) ?? "{}") as Record<string, string>;
    cur[label] = hash;
    localStorage.setItem(txKey(contract, rfpId), JSON.stringify(cur));
  } catch {
    /* tx links are a convenience, not a record */
  }
}

export function recallTxs(contract: string, rfpId: number): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(txKey(contract, rfpId)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
