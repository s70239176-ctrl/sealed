/**
 * Minimal GenLayer calldata decoder (https://github.com/yeagerai/genvm/blob/main/doc/calldata.md), enough to read a
 * transaction's return value out of a leader receipt. No dependencies, so it also runs in node for the e2e suite.
 *
 * A receipt result is base64 of one tag byte + body: tag 0 = return (calldata follows), 1 = contract refusal
 * (raw utf-8 message), 2 = VM error (raw message).
 */
export type Decoded = null | boolean | bigint | string | Uint8Array | Decoded[] | { [k: string]: Decoded };

export function decodeCalldata(bytes: Uint8Array): Decoded {
  let pos = 0;
  const dec = new TextDecoder("utf-8", { fatal: true });

  const take = (n: number): Uint8Array => {
    if (pos + n > bytes.length) throw new Error("calldata: unexpected end");
    const out = bytes.subarray(pos, pos + n);
    pos += n;
    return out;
  };

  const uleb = (): bigint => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const b = take(1)[0];
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result;
      shift += 7n;
    }
  };

  const value = (): Decoded => {
    const code = uleb();
    const type = Number(code & 7n);
    if (type === 0) {
      if (code === 0n) return null;
      if (code === 8n) return false;
      if (code === 16n) return true;
      if (code === 24n) return "0x" + [...take(20)].map((b) => b.toString(16).padStart(2, "0")).join("");
      throw new Error(`calldata: unknown special ${code}`);
    }
    const n = code >> 3n;
    switch (type) {
      case 1:
        return n;
      case 2:
        return -n - 1n;
      case 3:
        return take(Number(n)).slice();
      case 4:
        return dec.decode(take(Number(n)));
      case 5: {
        const arr: Decoded[] = [];
        for (let i = 0n; i < n; i++) arr.push(value());
        return arr;
      }
      case 6: {
        const obj: { [k: string]: Decoded } = {};
        for (let i = 0n; i < n; i++) {
          const klen = Number(uleb());
          const key = dec.decode(take(klen));
          obj[key] = value();
        }
        return obj;
      }
      default:
        throw new Error(`calldata: invalid type ${type}`);
    }
  };

  const out = value();
  if (pos !== bytes.length) throw new Error("calldata: trailing bytes");
  return out;
}

export type Receipt =
  | { kind: "return"; value: Decoded }
  | { kind: "refusal"; message: string }
  | { kind: "vm-error"; message: string }
  | { kind: "unknown" };

/** Decode a leader receipt's `result` payload (base64). */
export function decodeReceiptResult(payload: unknown): Receipt {
  if (typeof payload !== "string" || payload === "") return { kind: "unknown" };
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  } catch {
    return { kind: "unknown" };
  }
  if (bytes.length === 0) return { kind: "unknown" };
  const tag = bytes[0];
  const body = bytes.subarray(1);
  try {
    if (tag === 0) return { kind: "return", value: decodeCalldata(body) };
    const message = new TextDecoder().decode(body);
    if (tag === 1) return { kind: "refusal", message };
    if (tag === 2) return { kind: "vm-error", message };
  } catch {
    /* fall through */
  }
  return { kind: "unknown" };
}
