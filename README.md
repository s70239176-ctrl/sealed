# Sealed

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
- Contract (v2): `0x364F0979E0e7CE27f6AF8eC5AC9Ecf05967D96Be` (retry gap 60 s)
- Live run: [docs/e2e-v2.log](docs/e2e-v2.log). Four bids: A orders the jury to answer true, B tries to close the page
  block and forge the answer JSON, C honestly names an auditor and is the dearest, D is the cheapest and compliant but
  never reveals. A and B fail only the auditor bit, D is ineligible, C is paid the 3000 pool plus 300 of forfeited
  bonds and gets its own bond back (3400 total); the contract ends at balance 0.
- Earlier v1 logs (`docs/e2e-last-run.log`, `docs/e2e-injection.log`) are kept for the history.

## Run

    pip install -r requirements.txt
    PYTHONPATH=scripts python -m pytest -p windows_direct_plugin   # 90 tests (drop the plugin off Windows)
    npm install && node scripts/deploy.mjs 60 && node scripts/e2e-v2.mjs

## Client notes

`readContract` fails on Studionet once argument bytes pass ~200 ("RLP string ends with N superfluous bytes");
use `simulateWriteContract` for `lint_criteria` and `dry_run` (see `sim()` in `scripts/chain-lib.mjs`).
Payouts land when the settling transaction FINALIZES, not at ACCEPTED.

## Known limits

The `question` word-list taste filter is a floor, not a proof. Injection resistance is evidence from a few live runs,
not an audit. A page that never loads after 3 attempts is ineligible. A sponsor can still bid from a second wallet
(the receipt page should surface same-funder patterns). Demo bid pages are served by httpbin.org/base64. Studionet is
a test network, there is no frontend yet, and no external review has been done.
