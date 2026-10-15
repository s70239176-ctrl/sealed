// Parity check: the browser-side fingerprint and price commitment (web/src/lib/commit.ts) must equal what the
// deployed contract computes (dry_run's page_hash and commitment_for). Run live against the contract in web/.env.local.
// Usage (repo root):  node --experimental-strip-types scripts/parity.mjs
import { readFileSync } from "node:fs";
import { clientFor, sim, view } from "./chain-lib.mjs";
import { cleanPage, pageHash, priceCommitment } from "../web/src/lib/commit.ts";

const address = readFileSync("web/.env.local", "utf8").match(/VITE_CONTRACT_ADDRESS=(\S+)/)[1];
const c = clientFor();
const CRIT = JSON.stringify([{ kind: "contains", text: "abcd" }]);

const pages = {
  plain: "Hello world",
  html: "<html><head><style>p{color:red}</style><script>var a='<b>';</script></head><body><h1>Title</h1>\n\n\n<p>Para   one</p>\t<p>two</p></body></html>",
  unicode: "<p>日本語 テキスト 🚀 émoji ñ</p>\r\n\r\n<p>second</p>",
  whitespace: "   \n\n  leading and trailing  \n\n   ",
  delimiters: "<p>a <<< b >>> c</p>",
  attrs: '<a href="https://github.com/x" class="y">link</a> tail',
  long: ("word ".repeat(5200) + "🚀").slice(0, 26000),
  emojiEdge: "x".repeat(19999) + "🚀🚀🚀",
};

let bad = 0;
for (const [name, html] of Object.entries(pages)) {
  const local = await pageHash(cleanPage(html));
  const remote = (await sim(c, address, "dry_run", [CRIT, 1n, html])).page_hash;
  const ok = local === remote;
  if (!ok) bad++;
  console.log(ok ? "OK  " : "FAIL", "page", name, ok ? "" : `local=${local} remote=${remote}`);
}
for (const [rfp, who, price, salt] of [[1, "0xAbC0000000000000000000000000000000000001", 5n, "s"], [42, "0x" + "ab".repeat(20), 123456789n, "a longer secret word ✓"]]) {
  const local = await priceCommitment(rfp, who, price, salt);
  const remote = await view(c, address, "commitment_for", [BigInt(rfp), who, price, salt]);
  const ok = local === remote;
  if (!ok) bad++;
  console.log(ok ? "OK  " : "FAIL", "commitment", rfp, price.toString(), ok ? "" : `local=${local} remote=${remote}`);
}
console.log(bad === 0 ? "ALL MATCH" : `${bad} MISMATCH`);
process.exit(bad === 0 ? 0 : 1);
