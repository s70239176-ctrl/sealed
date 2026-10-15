/** GEN has 18 decimals. All amounts on the wire are wei (bigint); the page shows and takes GEN. */
const WEI = 10n ** 18n;

export function formatGen(wei: bigint, maxDecimals = 4): string {
  const whole = wei / WEI;
  const frac = wei % WEI;
  if (frac === 0n) return groupDigits(whole.toString());
  const digits = frac.toString().padStart(18, "0").slice(0, maxDecimals).replace(/0+$/, "");
  if (digits === "") return whole === 0n ? `<${"0." + "0".repeat(maxDecimals - 1)}1` : groupDigits(whole.toString());
  return `${groupDigits(whole.toString())}.${digits}`;
}

function groupDigits(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "1.5" -> 1500000000000000000n. Returns null for anything that is not a plain non-negative decimal. */
export function parseGen(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole) * WEI + BigInt(frac.padEnd(18, "0"));
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function formatDeadline(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function formatDate(unixSeconds: number): string {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—";
}

export function timeLeft(unixSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const d = unixSeconds - nowSeconds;
  if (d <= 0) return "closed";
  if (d < 3600) return `${Math.ceil(d / 60)}m left`;
  if (d < 86400) return `${Math.floor(d / 3600)}h left`;
  return `${Math.floor(d / 86400)}d left`;
}

export function hostOf(url: string, max = 56): string {
  const t = url.replace(/^https:\/\//, "");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** Percentage of the pool still available, 0-100. */
export function poolPercent(pool: bigint, initial: bigint): number {
  if (initial <= 0n) return 0;
  return Math.max(0, Math.min(100, Number((pool * 10000n) / initial) / 100));
}
