// Deploy Sealed to Studionet with a throwaway key made in this script (Studionet deploys are gasless).
// Usage (repo root):  node scripts/deploy.mjs [retry_gap]   -> prints the contract address, writes .env.local
// retry_gap is fixed at deployment forever: there is no admin. Default 1 h between page-fetch retries.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clientFor, freshKey, paced, sleep } from "./chain-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, "..", "contracts", "sealed.py"), "utf8");

const [gap = 3600] = process.argv.slice(2).map(Number);
const client = clientFor(freshKey());
console.log(`deploying Sealed to Studionet (retry_gap=${gap})…`);
const hash = await paced(() => client.deployContract({ code, args: [BigInt(gap)] }));
console.log("deploy tx", hash);

let address;
for (let i = 0; i < 60 && !address; i++) {
  await sleep(8000);
  const tx = await paced(() => client.request({ method: "eth_getTransactionByHash", params: [hash] }));
  const status = tx?.status ?? "PENDING";
  if (["ACCEPTED", "FINALIZED"].includes(status)) {
    address = tx?.data?.contract_address ?? tx?.to_address ?? tx?.recipient;
    if (!address) throw new Error("accepted but no contract address in " + JSON.stringify(Object.keys(tx ?? {})));
  } else if (["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(status)) {
    throw new Error("deploy failed: " + status);
  }
}
if (!address) throw new Error("deploy timed out");
console.log("CONTRACT_ADDRESS=" + address);
writeFileSync(join(here, "..", ".env.local"), `VITE_CONTRACT_ADDRESS=${address}\n`);
console.log("wrote .env.local");
