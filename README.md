# Sealed

An RFP whose sponsor provably could not steer the award. The sponsor locks funds and freezes typed yes/no
criteria before any bid exists; a jury of GenLayer validators fetches each bid page and agrees on the exact bit
vector; the payout is a table in code (none eligible: refund, one: paid, several: lowest price wins or split).
No admin key, and the sponsor cannot cancel, edit, pick a winner or bid.

Criterion kinds: `contains`, `license`, `price_max`, `deliverable` (all checked by code) and `question` (a yes/no fact,
the only model-judged kind; taste words are refused at setup). Design notes are in the contract docstring.

## Deployment (GenLayer Studio, `studionet`, chain id 61999)

- RPC: https://studio.genlayer.com/api
- Contract: `0x09f87A1b2F1cD890C184A5AB593274FD4359F7A9` (retry gap 60 s)
- Live demo log: [docs/e2e-last-run.log](docs/e2e-last-run.log) (RFP 2: two compliant bids, one begging bid that
  fails four of five bits; the cheapest eligible bid was paid 3000 and the contract ended at balance 0).

## Run

    pip install -r requirements.txt
    PYTHONPATH=scripts python -m pytest -p windows_direct_plugin   # 54 tests (drop the plugin off Windows)
    npm install && node scripts/deploy.mjs 60 && node scripts/e2e.mjs

## Known limits

Taste filtering of `question` criteria is a word-list floor, not a proof. A bid page is judged at evaluation time and
can change afterwards. A page that never loads after 3 attempts is ineligible. Bid pages in the demo are served by
httpbin.org/base64. Studionet is a test network; no frontend yet.
