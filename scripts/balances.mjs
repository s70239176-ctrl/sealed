// Contract balance and the settled RFPs' winners (payouts land when the settling tx FINALIZES).
import { readFileSync } from "node:fs";
import { clientFor, balanceOf, view } from "./chain-lib.mjs";
const address = process.argv[2] ?? readFileSync(".env.local", "utf8").match(/VITE_CONTRACT_ADDRESS=(\S+)/)[1];
const c = clientFor();
console.log("contract balance", String(await balanceOf(c, address)));
for (const id of [1n, 2n]) {
  const r = await view(c, address, "get_rfp", [id]);
  console.log(id, r.outcome, JSON.stringify(r.winners), "sponsor", r.sponsor);
  for (const bid of r.bid_ids) {
    const b = await view(c, address, "get_bid", [BigInt(bid)]);
    console.log("  bid", bid, "bidder", b.bidder, "balance", String(await balanceOf(c, b.bidder)));
  }
  console.log("  sponsor balance", String(await balanceOf(c, r.sponsor)));
}
