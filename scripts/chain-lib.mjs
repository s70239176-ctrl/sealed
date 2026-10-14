// Shared helpers for the deploy, smoke and e2e scripts. Run from the repo root (genlayer-js lives there).
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import * as chains from "genlayer-js/chains";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** AGON_CHAIN selects the network: studionet (default), testnetBradbury or testnetAsimov. */
export const chain = chains[process.env.AGON_CHAIN ?? "studionet"];
if (!chain) throw new Error("unknown AGON_CHAIN " + process.env.AGON_CHAIN);

export function clientFor(key) {
  return createClient({ chain, account: key ? createAccount(key) : undefined });
}
export const freshKey = () => generatePrivateKey();
export const addressOf = (key) => createAccount(key).address;

/** Studionet allows ~30 requests a minute per client: retry rate limits and gateway blips. */
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("request timed out")), ms))]);

export async function paced(fn) {
  for (let i = 0; i < 12; i++) {
    try {
      return await withTimeout(fn(), 90000);
    } catch (e) {
      const text = `${e?.message ?? e} ${JSON.stringify(e?.cause ?? "", (_, v) => (typeof v === "bigint" ? v.toString() : v))}`;
      const m = text.match(/retry_after_seconds\D+(\d+)/);
      if (text.includes("-32029") || m) { await sleep(((m ? Number(m[1]) : 20) + 2) * 1000); continue; }
      if (/fetch failed|Failed to fetch|ECONNRESET|ETIMEDOUT|timed out|<html|<!DOCTYPE|Unexpected token '<'|unknown RPC error|Bad Gateway|Service Unavailable|Gateway Time-out/i.test(text)) {
        await sleep((6 + i * 5) * 1000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("network kept failing");
}

export const plain = (v) =>
  v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)]))
  : Array.isArray(v) ? v.map(plain)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  : v;

export async function view(client, address, functionName, args = []) {
  return plain(await paced(() => client.readContract({ address, functionName, args })));
}

export async function balanceOf(client, address) {
  const hex = await paced(() => client.request({ method: "eth_getBalance", params: [address, "latest"] }));
  return BigInt(hex);
}

const DEAD = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

/** The contract's own refusal text from a leader receipt, or null when the call succeeded. */
export function revertOf(tx) {
  const receipts = tx?.consensus_data?.leader_receipt;
  const leader = receipts?.find((r) => r.mode === "leader") ?? receipts?.[0];
  if (!leader || leader.execution_result !== "ERROR") return null;
  const res = typeof leader.result === "string" ? leader.result : leader.result?.payload;
  if (!res) return "(error without payload)";
  const bytes = Buffer.from(res, "base64");
  return bytes.subarray(bytes[0] <= 8 ? 1 : 0).toString("utf8");
}

/**
 * Send a write and poll one cheap RPC until the network settles it.
 * waitFor "ACCEPTED" returns at the first accepted state; "FINALIZED" waits for finalization.
 * A contract refusal (ERROR receipt) returns immediately. onStatus fires on every status change.
 * Returns { hash, status, tx, revert }.
 */
export async function write(client, address, functionName, args, value = 0n, waitFor = "ACCEPTED", onStatus) {
  const hash = await paced(() => client.writeContract({ address, functionName, args, value }));
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 20 * 60 * 1000) {
    await sleep(8000);
    const tx = await paced(() => client.request({ method: "eth_getTransactionByHash", params: [hash] }));
    const status = tx?.status ?? "PENDING";
    if (status !== last) {
      last = status;
      if (onStatus) await onStatus(status, tx);
    }
    if (DEAD.has(status)) return { hash, status, tx, revert: revertOf(tx) };
    if (status === "ACCEPTED" || status === "FINALIZED") {
      const revert = revertOf(tx);
      if (revert !== null) return { hash, status, tx, revert };
      if (waitFor === "ACCEPTED" || status === "FINALIZED") return { hash, status, tx, revert: null };
    }
  }
  return { hash, status: "TIMEOUT", tx: null, revert: null };
}

/**
 * A view call with LONG arguments (more than ~200 bytes). On Studionet with genlayer-js 1.1.8, readContract fails with
 * "RLP string ends with N superfluous bytes" once the argument bytes pass roughly 200, while simulateWriteContract
 * (the same gen_call, type "write") handles them. Use this for lint_criteria / dry_run.
 */
export async function sim(client, address, functionName, args = []) {
  const unbig = (v) =>
    typeof v === "bigint" ? Number(v) : Array.isArray(v) ? v.map(unbig)
    : v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), unbig(x)]))
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unbig(x)]))
    : v;
  return unbig(await paced(() => client.simulateWriteContract({ address, functionName, args })));
}
