import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanPage, fingerprintText, isHash, newSalt, pageHash, priceCommitment } from "./commit.ts";
import { REFUSALS, decodeRevert, describeError, toBid, toRfp } from "./decode.ts";
import { TEMPLATES, describeCriterion } from "./templates.ts";
import { formatGen, parseGen } from "./format.ts";

test("every refusal the contract can raise has a plain-language message", () => {
  const src = readFileSync(new URL("../../../contracts/sealed.py", import.meta.url), "utf8");
  const keys = new Set([...src.matchAll(/_fail\("([^"]+)"\)/g)].map((m) => m[1]));
  const missing = [...keys].filter((k) => !(k in REFUSALS));
  // "bad retry gap" is a deploy-time check, never shown to a user of the app
  assert.deepEqual(missing.filter((k) => k !== "bad retry gap"), []);
});

test("price commitment is bound to rfp, bidder, price and secret, and ignores address case", async () => {
  const a = await priceCommitment(1, "0xAbC", 5n, "s");
  assert.equal(a, await priceCommitment(1, "0xabc", 5n, "s"));
  assert.ok(isHash(a));
  for (const other of [await priceCommitment(2, "0xabc", 5n, "s"), await priceCommitment(1, "0xabd", 5n, "s"), await priceCommitment(1, "0xabc", 6n, "s"), await priceCommitment(1, "0xabc", 5n, "t")]) {
    assert.notEqual(a, other);
  }
});

test("cleanPage strips markup and collapses whitespace like the contract", async () => {
  assert.equal(cleanPage("<style>p{}</style><h1>Hi</h1>\n\n\n<p>a   b</p>"), "Hi \n a b");
  assert.equal(cleanPage("   x   "), "x");
  const fp = await fingerprintText("<p>hello</p>");
  assert.equal(fp.text, "hello");
  assert.equal(fp.hash, await pageHash("hello"));
  await assert.rejects(() => fingerprintText("<p></p>"), /empty/);
});

test("secret words are random and long enough", () => {
  const a = newSalt();
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.notEqual(a, newSalt());
});

test("contract dictionaries decode, keeping wei exact", () => {
  const rfp = toRfp({
    id: 3n, sponsor: "0xABCD", title: "t", criteria: [{ kind: "contains", text: "x" }], criteria_hash: "h", tie_rule: "lowest",
    pool: 3000000000000000000n, bond: 100000000000000000n, bid_deadline: 10n, reveal_deadline: 20n, created_at: 1n, status: "SETTLED",
    outcome: "PAID", bid_ids: [1n], winners: [{ bid_id: 1n, amount: 3100000000000000000n }], returned: [], forfeited: 0n, settled_at: 30n,
  });
  assert.equal(rfp.pool, 3000000000000000000n);
  assert.equal(rfp.sponsor, "0xabcd");
  assert.deepEqual(rfp.winners, [{ bidId: 1, amount: 3100000000000000000n }]);
  const bid = toBid({ id: 1, rfp_id: 3, bidder: "0xAA", url: "https://x.example/p", price_commit: "c", content_hash: "h", bond: 1n, price: null, status: "COMMITTED", source: null, bits: null, eligible: null, attempts: 0, created_at: 1, recheck: null });
  assert.equal(bid.price, null);
  assert.equal(bid.bits, null);
  const done = toBid({ id: 1, rfp_id: 3, bidder: "0xAA", url: "u", price_commit: "c", content_hash: "h", bond: 1n, price: 100n, status: "EVALUATED", source: "ok", bits: [true, false], eligible: false, attempts: 0, created_at: 1, recheck: { count: 2n, matches: true, at: 5n, source: "ok" } });
  assert.deepEqual(done.bits, [true, false]);
  assert.equal(done.recheck?.count, 2);
});

test("revert payloads decode to the contract's own words", () => {
  const b64 = (s: string) => Buffer.from(Uint8Array.from([1, ...new TextEncoder().encode(s)])).toString("base64");
  assert.equal(decodeRevert(b64("bond mismatch")), "bond mismatch");
  assert.equal(describeError({ cause: { data: { receipt: { result: b64("bond mismatch") } } } }), REFUSALS["bond mismatch"]);
  assert.equal(describeError(new Error("user rejected the request")), "You declined the request in your wallet.");
});

test("every template passes a plausible shape and describes itself", () => {
  for (const t of TEMPLATES) {
    assert.ok(t.criteria.length >= 1 && t.criteria.length <= 8, t.id);
    for (const c of t.criteria) assert.ok(typeof describeCriterion(c) === "string");
  }
  // question templates must not contain taste words the contract refuses
  const taste = /\b(best|better|good|great|nice|quality|innovative|creative|elegant|strong|impressive|compelling|promising|superior|excellent|appealing|beautiful|interesting|clear|convincing|robust|solid|well|worthy|merit)\b/i;
  for (const t of TEMPLATES) for (const c of t.criteria) if (c.kind === "question") assert.ok(c.text.endsWith("?") && !taste.test(c.text), c.text);
});

test("GEN amounts round-trip exactly", () => {
  assert.equal(parseGen("3.1"), 3100000000000000000n);
  assert.equal(formatGen(3100000000000000000n), "3.1");
  assert.equal(parseGen("abc"), null);
});
