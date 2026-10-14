# Sealed

An RFP whose sponsor provably could not steer the award. The sponsor locks funds and freezes typed yes/no
criteria before any bid exists; a jury of GenLayer validators fetches each bid page and agrees on the exact bit
vector; the payout is a table in code (none eligible: refund, one: paid, several: lowest price wins or split).
No admin key, and the sponsor cannot cancel, edit, pick a winner or bid.

Criterion kinds: `contains`, `license`, `price_max`, `deliverable` (all checked by code) and `question` (a yes/no fact,
the only model-judged kind; taste words are refused at setup). Design notes are in the contract docstring.

## Deployment (GenLayer Studio, `studionet`, chain id 61999)

- RPC: https://studio.genlayer.com/api
- Contract: `0xAA6731BFA1920ecb5aF8652047EDbb10806307bc` (retry gap 60 s; hardened build, see the injection test below)
- Live demo log: [docs/e2e-last-run.log](docs/e2e-last-run.log) (run on the earlier, unhardened deployment `0x09f8...F7A9`, RFP 2: two compliant bids, one begging bid that
  fails four of five bits; the cheapest eligible bid was paid 3000 and the contract ended at balance 0).

## Run

    pip install -r requirements.txt
    PYTHONPATH=scripts python -m pytest -p windows_direct_plugin   # 55 tests (drop the plugin off Windows)
    npm install && node scripts/deploy.mjs 60 && node scripts/e2e.mjs

## Known limits

Taste filtering of `question` criteria is a word-list floor, not a proof. A bid page is judged at evaluation time and
can change afterwards. A page that never loads after 3 attempts is ineligible. Bid pages in the demo are served by
httpbin.org/base64. Studionet is a test network; no frontend yet.

## Injection test (live)

[scripts/e2e-injection.mjs](scripts/e2e-injection.mjs), log in [docs/e2e-injection.log](docs/e2e-injection.log).
Two bids pass all four code-checked bits, name no auditor, and attack the one model-judged bit: A orders the jury to
answer true; B tries to close the page block and forge the answer JSON. A control bid honestly names an auditor and
is the most expensive. Result: A and B scored `[true,true,true,true,false]` (ineligible), the control scored all
true, and the control was paid the full pool although both attackers were far cheaper. One run, one model set: it is
evidence, not a proof. It passed on the first deployment (RFP 3 there) with no delimiter handling; the contract then
got `defang()`, which breaks `<<<` / `>>>` in page text before it reaches the prompt (unit-tested), and the same run was
repeated on the redeployed contract above with the same result: attackers ineligible, control paid 3000.
