# Sealed

**Live app:** https://s70239176-ctrl.github.io/sealed/ · **Example receipt:** https://s70239176-ctrl.github.io/sealed/#/rfp/1/receipt (Studionet test network)

An RFP whose sponsor provably could not steer the award. The sponsor locks funds and freezes typed yes/no
criteria before any bid exists; a jury of GenLayer validators fetches each bid page and agrees on the exact bit
vector; the payout is a table in code. No admin key, and the sponsor cannot cancel, edit, pick a winner or bid.

**Criteria** (all code-checked except the last): `contains`, `license`, `price_max`, `deliverable`, and `question`, a
yes/no fact about the page and the only model-judged kind. Taste words are refused at setup.

**v2 mechanics**

- **Sealed prices.** A bid commits to `sha256(rfp|bidder|price|salt)` and reveals it after bidding closes, so nobody can
  undercut a visible price. A bid that never reveals is ineligible and never reaches the jury.
- **Locked content.** A bid commits to the hash of its cleaned page. A page edited afterwards is ineligible.
- **Bond.** Every bid posts the RFP's bond. If nobody wins, everyone gets their bond back. If someone wins, the bonds
  of ineligible bids join the prize. The sponsor never receives a bond, so failing bidders cannot profit a sponsor.
- **Award.** none eligible: pool back to the sponsor; one: paid; several: lowest revealed price wins (equal lowest
  prices split) or `split` divides among all eligible.
- **Linter.** `lint_criteria` and `dry_run` are free views running the contract's own code, so a sponsor can test
  criteria on sample pages (and get the page hash a bid must commit to) before locking funds.

## Deployment (GenLayer Studio, `studionet`, chain id 61999)

- RPC: https://studio.genlayer.com/api
- Contract (current, v3 with `recheck_bid`, `get_receipt`, `list_rfps`): `0x6Bb104dcB1729037aCa3AC1216B4002251dd7D80` (retry gap 60 s). The v2 contract `0x364F...96Be` ran the four-bid log below.
- Live run: [docs/e2e-v2.log](docs/e2e-v2.log). Four bids: A orders the jury to answer true, B tries to close the page
  block and forge the answer JSON, C honestly names an auditor and is the dearest, D is the cheapest and compliant but
  never reveals. A and B fail only the auditor bit, D is ineligible, C is paid the 3000 pool plus 300 of forfeited
  bonds and gets its own bond back (3400 total); the contract ends at balance 0.
- Earlier v1 logs (`docs/e2e-last-run.log`, `docs/e2e-injection.log`) are kept for the history.

## Run

    pip install -r requirements.txt
    PYTHONPATH=scripts python -m pytest -p windows_direct_plugin   # 95 tests (drop the plugin off Windows)
    npm install && node scripts/deploy.mjs 60 && node scripts/e2e-v2.mjs

## Web app (`web/`)

React + TypeScript + Vite, `genlayer-js@1.1.8`, no backend. Pages: RFP list, **create** (template picker, live criteria linter,
dry run on a sample page, funding), **RFP** (stage timeline, sealed bid with in-browser page fingerprint, reveal, "Run the
jury" per bid with the validator votes and appeal window, settle), and a shareable **receipt** (frozen terms and fingerprint,
bit matrix, outcome, and "Re-run the check" which records an audit result without ever changing eligibility or payout).
Wallet: an EIP-1193 wallet (MetaMask) or a throwaway demo key. A bid's price and secret word are kept in this browser
and shown to the bidder so they can reveal.

    cd web && npm install && echo VITE_CONTRACT_ADDRESS=0x... > .env.local && npm run dev
    npm test            # 8 tests: decoding, commitments, templates, and that every contract refusal has a message
    node --experimental-strip-types ../scripts/parity.mjs   # browser hashing vs the live contract (10 cases)

Driven end to end through the UI on live Studionet (RFP 1 on the current contract): create, bid, reveal, jury, settle, and
re-check; the bidder ended with the 3 GEN prize plus its 0.1 GEN bond and the contract at 0.

## Client notes

`readContract` fails on Studionet once argument bytes pass ~200 ("RLP string ends with N superfluous bytes");
use `simulateWriteContract` for `lint_criteria` and `dry_run` (see `sim()` in `scripts/chain-lib.mjs`).
Payouts land when the settling transaction FINALIZES, not at ACCEPTED.

## Hosting and the wallet test

**Vercel:** import the repo and set the project's Root Directory to `web`. No environment variable is needed: the app defaults to the
contract above. Set `VITE_CONTRACT_ADDRESS` only to point it at a different deployment.

The app is served from the `gh-pages` branch (built with `VITE_CONTRACT_ADDRESS` set; rebuild and force-push `web/dist` there to update it). `ci/` holds GitHub Actions templates (CI, GitHub Pages) and `web/vercel.json` the Vercel config; see `ci/README.md`. The workflows are not active because the token used to publish this repo lacks the `workflow` scope.
`docs/METAMASK-CHECKLIST.md` is the 11-step walkthrough for a person with MetaMask. The wallet walkthrough has not been run: the build tooling cannot drive a browser-extension wallet.

## Known limits

The `question` word-list taste filter is a floor, not a proof. Injection resistance is evidence from a few live runs,
not an audit. A page that never loads after 3 attempts is ineligible. A sponsor can still bid from a second wallet,
and the contract cannot see who funded a wallet (Studionet accounts are gasless), so the app cannot flag it; the sponsor's
address is shown on every RFP and receipt so others can judge for themselves. Demo bid pages are served by httpbin.org/base64. Studionet is
a test network and no external review has been done. The app has not been tested with a real MetaMask yet (only the demo key),
and the page fingerprint is computed in the browser, so a site that blocks cross-origin reads needs the bidder to paste the page source.
