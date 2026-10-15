/**
 * The one GenLayer client file. Nothing in this app decides eligibility, a payout or an appeal outcome:
 * the page sends what the contract asks for and shows what it answers. Reads are batched (get_receipt, list_rfps)
 * because the hosted RPC allows roughly 30 requests a minute per client.
 */
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Criterion, DryRunResult, LintResult, Page, Phase, Receipt, Rfp, RfpSummary, TxOutcome } from "./types.ts";
import { REFUSALS, TIME_DEPENDENT, decodeRevert, plain, refusalKey, toDryRun, toLint, toReceipt, toRfp, toSummary, type Raw } from "./decode.ts";
import { decodeReceiptResult } from "./calldata.ts";
import { assertSignerReady, getProvider, type Signer } from "./signer.ts";

export { describeError } from "./decode.ts";

type Hex = `0x${string}`;

export const CONTRACT = (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined)?.trim() ?? "";
export const hasContract = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT) && !/^0x0+$/.test(CONTRACT);
export const NETWORK = studionet.name;
export const EXPLORER = studionet.blockExplorers?.default.url ?? "https://explorer-studio.genlayer.com";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** genlayer-js 1.1.8 is what the live Studionet accepts (the 2.0.0-rc client cannot read or deploy against it). */
interface Loose {
  readContract: (a: unknown) => Promise<unknown>;
  writeContract: (a: unknown) => Promise<unknown>;
  simulateWriteContract?: (a: unknown) => Promise<unknown>;
  request: (a: { method: string; params: unknown[] }) => Promise<unknown>;
  canAppeal: (a: { txId: Hex }) => Promise<boolean>;
  appealTransaction: (a: unknown) => Promise<unknown>;
  getAppealCharge?: (a: { txId: Hex }) => Promise<bigint>;
  getMinAppealBond: (a: { txId: Hex }) => Promise<bigint>;
}

function readClient(): Loose {
  return createClient({ chain: studionet }) as unknown as Loose;
}

function writeClient(signer: Signer): Loose {
  if (signer.kind === "sandbox") {
    return createClient({ chain: studionet, account: createAccount(signer.key) }) as unknown as Loose;
  }
  const provider = getProvider();
  if (!provider) throw new Error("No browser wallet found. Install an EIP-1193 wallet such as MetaMask, or use the demo account.");
  return createClient({ chain: studionet, account: signer.address as Hex, provider: provider as never }) as unknown as Loose;
}

// ------------------------------------------------------------------ pacing
function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)) ?? "";
  } catch {
    return "";
  }
}

/** Retries rate limits and network blips; anything else is a real error and is rethrown. */
async function paced<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const text = `${e instanceof Error ? e.message : String(e)} ${safeJson((e as { cause?: unknown })?.cause)}`;
      const m = text.match(/retry_after_seconds\D+(\d+)/);
      if (text.includes("-32029") || m) {
        await sleep(((m ? Number(m[1]) : 20) + 2) * 1000);
        continue;
      }
      if (/fetch failed|Failed to fetch|NetworkError|ECONNRESET|ETIMEDOUT|<html|<!DOCTYPE|Unexpected token '<'|unknown RPC error|502|503|504/i.test(text)) {
        await sleep((6 + attempt * 5) * 1000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("The network kept failing. Try again in a minute.");
}

function need(): void {
  if (!hasContract) throw new Error("No contract address is configured. Set VITE_CONTRACT_ADDRESS.");
}

// ------------------------------------------------------------------ reads
async function view(functionName: string, args: unknown[]): Promise<unknown> {
  need();
  return plain(await paced(() => readClient().readContract({ address: CONTRACT as Hex, functionName, args })));
}

/**
 * A view with LONG arguments (criteria JSON, page text). On Studionet with genlayer-js 1.1.8, readContract fails with
 * "RLP string ends with N superfluous bytes" once the argument bytes pass ~200; simulateWriteContract (the same gen_call
 * with type "write") handles them. Measured live.
 */
async function bigView(functionName: string, args: unknown[]): Promise<unknown> {
  need();
  const c = readClient();
  if (!c.simulateWriteContract) return view(functionName, args);
  // criteria and bits are small numbers, not wei: make them plain so they can be JSON.stringify'd back into a call
  return unbig(plain(await paced(() => c.simulateWriteContract!({ address: CONTRACT as Hex, functionName, args }))));
}

function unbig(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) return v.map(unbig);
  if (v && typeof v === "object" && !(v instanceof Uint8Array)) return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, unbig(x)]));
  return v;
}

export async function listRfps(offset = 0, limit = 20): Promise<Page<RfpSummary>> {
  const r = (await view("list_rfps", [BigInt(offset), BigInt(limit)])) as Raw;
  return { total: Number(r.total), items: (r.items as Raw[]).map(toSummary) };
}

export async function getRfp(id: number): Promise<Rfp> {
  return toRfp((await view("get_rfp", [BigInt(id)])) as Raw);
}

/** The whole RFP and every bid in ONE read. */
export async function getReceipt(id: number): Promise<Receipt> {
  return toReceipt((await view("get_receipt", [BigInt(id)])) as Raw);
}

export async function lintCriteria(criteria: Criterion[]): Promise<LintResult> {
  return toLint((await bigView("lint_criteria", [JSON.stringify(criteria)])) as Raw);
}

export async function dryRun(criteria: Criterion[], price: number, pageHtml: string): Promise<DryRunResult> {
  return toDryRun((await bigView("dry_run", [JSON.stringify(criteria), BigInt(price), pageHtml])) as Raw);
}

/** The contract's own commitment rule, as a free read (the app also computes it locally; tests compare the two). */
export async function commitmentFor(rfpId: number, bidder: string, price: bigint, salt: string): Promise<string> {
  return String(await view("commitment_for", [BigInt(rfpId), bidder, price, salt]));
}

export async function chainNow(): Promise<number> {
  const block = (await paced(() =>
    readClient().request({ method: "eth_getBlockByNumber", params: ["latest", false] }),
  )) as { timestamp?: string } | null;
  return block?.timestamp ? Number(BigInt(block.timestamp)) : Math.floor(Date.now() / 1000);
}

export async function contractBalance(): Promise<bigint> {
  if (!hasContract) return 0n;
  const hex = (await paced(() => readClient().request({ method: "eth_getBalance", params: [CONTRACT, "latest"] }))) as string;
  return BigInt(hex);
}

// ------------------------------------------------------------------ writes
interface RawTx {
  status?: string;
  appealed?: boolean;
  num_of_rounds?: string | number;
  consensus_data?: {
    votes?: Record<string, string>;
    leader_receipt?: Array<{ mode?: string; execution_result?: string; result?: unknown }>;
  };
}

const DEAD_TEXT: Record<string, string> = {
  UNDETERMINED: "The validators could not agree, so nothing was recorded and no GEN moved. You can try again.",
  CANCELED: "The transaction was cancelled before it ran. Nothing changed.",
  LEADER_TIMEOUT: "The lead validator timed out. Nothing changed. Try again.",
  VALIDATORS_TIMEOUT: "The validators timed out. Nothing changed. Try again.",
};
const DEAD = new Set(Object.keys(DEAD_TEXT));

function leaderPayload(tx: RawTx): { mode?: string; execution_result?: string; payload?: string } | undefined {
  const receipts = tx.consensus_data?.leader_receipt;
  const leader = receipts?.find((r) => r.mode === "leader") ?? receipts?.[0];
  if (!leader) return undefined;
  const res = leader.result;
  return { ...leader, payload: typeof res === "string" ? res : (res as { payload?: string } | undefined)?.payload };
}

/** A contract refusal (raised) or a soft refusal (payable calls return {ok:false, reason} and refund the value). */
function leaderProblem(tx: RawTx): string | undefined {
  const leader = leaderPayload(tx);
  if (!leader) return undefined;
  if (leader.execution_result === "ERROR") {
    const text = decodeRevert(leader.payload);
    return text ? (REFUSALS[text] ?? text) : "The contract refused the call.";
  }
  const decoded = decodeReceiptResult(leader.payload);
  if (decoded.kind === "return" && decoded.value && typeof decoded.value === "object" && !Array.isArray(decoded.value)) {
    const v = decoded.value as Record<string, unknown>;
    if (v.ok === false) {
      const reason = String(v.reason ?? "");
      return `${REFUSALS[reason] ?? reason} Any GEN you attached is being returned to you.`;
    }
  }
  return undefined;
}

function leaderReturn(tx: RawTx): { result?: string; id?: number } {
  const leader = leaderPayload(tx);
  const decoded = decodeReceiptResult(leader?.payload);
  if (decoded.kind !== "return") return {};
  if (typeof decoded.value === "string") return { result: decoded.value };
  if (decoded.value && typeof decoded.value === "object" && !Array.isArray(decoded.value) && !(decoded.value instanceof Uint8Array)) {
    const id = (decoded.value as Record<string, unknown>).id;
    if (typeof id === "bigint") return { id: Number(id) };
  }
  return {};
}

export async function readTx(hash: string): Promise<RawTx | null> {
  return (await paced(() => readClient().request({ method: "eth_getTransactionByHash", params: [hash] }))) as RawTx | null;
}

export interface JuryView {
  status: string;
  votes: { validator: string; vote: string }[];
  rounds: number;
  appealed: boolean;
}

/** The real jury behind an evaluate transaction, straight from the node's consensus data. */
export async function readJury(hash: string): Promise<JuryView | null> {
  const tx = await readTx(hash);
  if (!tx) return null;
  const raw = tx.consensus_data?.votes ?? {};
  return {
    status: tx.status ?? "PENDING",
    votes: Object.entries(raw).map(([validator, vote]) => ({ validator: validator.toLowerCase(), vote: String(vote) })),
    rounds: Number(tx.num_of_rounds ?? 1),
    appealed: Boolean(tx.appealed),
  };
}

/** Follow a transaction to finalization. 8 s polling keeps one client well under the RPC limit. */
async function follow(hash: string, onPhase?: (p: Phase, detail?: string) => void, until: "accepted" | "finalized" = "accepted"): Promise<TxOutcome> {
  const started = Date.now();
  let accepted = false;
  while (Date.now() - started < 20 * 60 * 1000) {
    await sleep(8000);
    const tx = await readTx(hash);
    const status = tx?.status ?? "PENDING";
    onPhase?.(accepted ? "accepted" : "pending", status);
    if (DEAD.has(status)) return { hash, status, error: DEAD_TEXT[status] };
    if (status === "ACCEPTED" || status === "FINALIZED") {
      const error = tx ? leaderProblem(tx) : undefined;
      if (error) return { hash, status, error };
      if (status === "FINALIZED") {
        onPhase?.("finalized", status);
        return { hash, status, ...(tx ? leaderReturn(tx) : {}) };
      }
      if (until === "accepted") return { hash, status, ...(tx ? leaderReturn(tx) : {}) };
      accepted = true;
      onPhase?.("accepted", status);
    }
  }
  return { hash, status: "TIMEOUT", error: "Still not finalized after 20 minutes. Nothing is lost: GEN moves only on finalization. Check back later." };
}

/**
 * A refused payable call keeps its attached GEN inside the contract on this runtime (measured), so before any value
 * leaves the account the call is dry-run. Clock-dependent refusals never block: a dry run may see a stale time.
 */
async function preflight(client: Loose, functionName: string, args: unknown[], value: bigint): Promise<void> {
  if (value === 0n || !client.simulateWriteContract) return;
  try {
    await paced(() => client.simulateWriteContract!({ address: CONTRACT as Hex, functionName, args, value }));
  } catch (e) {
    const refusal = refusalKey(e);
    if (refusal && !TIME_DEPENDENT.has(refusal)) throw new Error(REFUSALS[refusal] ?? refusal);
  }
}

/** Send a write (dry-run first when it carries GEN), then follow it to finalization. */
export async function sendTx(
  signer: Signer,
  functionName: string,
  args: unknown[],
  value = 0n,
  onPhase?: (p: Phase, detail?: string) => void,
  onHash?: (hash: string) => void,
  /** "accepted" returns once the state is applied (enough for everything but payouts); settle waits for "finalized". */
  until: "accepted" | "finalized" = "accepted",
): Promise<TxOutcome> {
  need();
  await assertSignerReady(signer);
  const client = writeClient(signer);
  onPhase?.("signing");
  await preflight(client, functionName, args, value);
  const hash = (await paced(() => client.writeContract({ address: CONTRACT, functionName, args, value }))) as string;
  onHash?.(hash);
  onPhase?.("pending");
  return follow(hash, onPhase, until);
}

// ------------------------------------------------------------------ protocol appeal
export interface AppealInfo {
  /** The round is still inside its appeal window. */
  appealable: boolean;
  charge: bigint | null;
  /** This network accepts an appeal transaction from the SDK. Studionet does not (measured). */
  fileable: boolean;
}

/**
 * Asks the protocol, not this app, whether the round is still appealable and what it costs. Studionet's chain config
 * has no appeals contract, so `canAppeal` is unavailable there; the round is then appealable exactly while its
 * transaction is ACCEPTED and not yet FINALIZED, and no charge is quoted.
 */
export async function appealInfo(txHash: string): Promise<AppealInfo> {
  const client = readClient();
  try {
    const appealable = await paced(() => client.canAppeal({ txId: txHash as Hex }));
    if (!appealable) return { appealable: false, charge: null, fileable: true };
    const charge = await paced(() =>
      client.getAppealCharge ? client.getAppealCharge({ txId: txHash as Hex }) : client.getMinAppealBond({ txId: txHash as Hex }),
    );
    return { appealable: true, charge, fileable: true };
  } catch (e) {
    if (!/not supported on this chain|missing/i.test(String((e as Error)?.message ?? e))) throw e;
    const tx = await readTx(txHash);
    return { appealable: tx?.status === "ACCEPTED", charge: null, fileable: false };
  }
}

export async function appeal(signer: Signer, txHash: string, charge: bigint | null): Promise<string> {
  await assertSignerReady(signer);
  const client = writeClient(signer);
  try {
    return String(await paced(() => client.appealTransaction({ txId: txHash as Hex, value: charge ?? 0n })));
  } catch (e) {
    if (/Invalid transaction data|Invalid parameters/i.test(String((e as Error)?.message ?? e))) {
      throw new Error("This network did not accept the appeal transaction. Protocol appeals are filed on a network with the consensus contracts (Testnet).");
    }
    throw e;
  }
}
