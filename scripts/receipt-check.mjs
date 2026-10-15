// Read an RFP's receipt and the on-chain balances of everyone it paid. Usage: node scripts/receipt-check.mjs <rfp id> [contract]
import { readFileSync } from "node:fs";
import { clientFor, view, balanceOf } from "./chain-lib.mjs";
const id = BigInt(process.argv[2] ?? 1);
const address = process.argv[3] ?? readFileSync("web/.env.local", "utf8").match(/VITE_CONTRACT_ADDRESS=(\S+)/)[1];
const c = clientFor();
const { rfp, bids } = await view(c, address, "get_receipt", [id]);
console.log("outcome", rfp.outcome, "status", rfp.status, "winners", JSON.stringify(rfp.winners), "returned", JSON.stringify(rfp.returned), "forfeited", String(rfp.forfeited));
for (const b of bids) console.log("bid", b.id, b.bidder, "eligible", b.eligible, "balance", String(await balanceOf(c, b.bidder)), "recheck", JSON.stringify(b.recheck));
console.log("sponsor balance", String(await balanceOf(c, rfp.sponsor)), "| contract balance", String(await balanceOf(c, address)));
process.exit(0);
