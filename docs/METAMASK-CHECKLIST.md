# MetaMask walkthrough (manual, needs a real wallet)

The automated runs sign with throwaway keys. They cannot drive a browser-extension wallet, so **this walkthrough has not
been run by the build tooling**. It is written so one person with MetaMask can do it in about 30 minutes and leave
evidence a reviewer can check.

You need: Chrome or Edge with MetaMask, two accounts (A = sponsor, B = bidder), and GEN on the network you test
(Studionet is free). Use the deployed app, or `cd web && npm run dev` with `VITE_CONTRACT_ADDRESS` set to the current
contract. Create the RFP with the **5 minutes (demo)** bidding and **3 minutes (demo)** reveal windows so it finishes in
one sitting.

For every step, write down the **transaction hash** MetaMask shows and the **balance of the account before and after**.

| # | Account | Action in the app | What to confirm | Record |
| --- | --- | --- | --- | --- |
| 1 | A | **Connect wallet**, approve the network add/switch prompt | the header shows A's address, not "Demo account" | address |
| 2 | A | **New RFP**, pick *Procurement bid*, set pool 3 and bond 0.1, press **Lock** | MetaMask asks to send exactly 3 GEN as value; the RFP page opens | tx hash, A balance −3 |
| 3 | B | switch MetaMask to B, reload, **Connect wallet** | header shows B | address |
| 4 | B | open the RFP, paste a public bid page URL, **Fingerprint this page**, enter a price, **Seal my bid** | the app computes the fingerprint with no prompt; MetaMask asks to send exactly the bond | tx hash, B balance −0.1 |
| 5 | B | wait for *Reveal window*, press **Reveal my price** | the price and secret word are prefilled; MetaMask asks for a zero-value transaction | tx hash |
| 6 | B | wait for *Ready to evaluate*, press **Run the jury** | wait for "Result: eligible" (about a minute); *Show the jury* lists the validators | tx hash |
| 7 | B | press **Settle the RFP** | the status reads "Accepted, waiting for finalization", then the RFP shows *Settled* | tx hash |
| 8 | B | check B's balance after finalization | B rose by the pool plus the bond (3.1 GEN) minus fees | balance before / after |
| 9 | any | open the **receipt**, press **Re-run the check** | "re-check matches" appears; nothing else on the page changes | tx hash |
| 10 | B | reject one MetaMask prompt on purpose | the app shows "You declined the request in your wallet." and sends nothing | screenshot |
| 11 | A | switch MetaMask to B's account while connected as A, then try an action | the app refuses with "The wallet switched to a different account..." | screenshot |

Notes for the reviewer:

- A refused payable call keeps its attached GEN inside the contract on this runtime, so the app dry-runs every payable
  action first and shows the contract's refusal in plain language before any value leaves the wallet.
- Payouts are sent when the settling transaction finalizes, not when it is accepted. Step 8 is only meaningful after
  the app shows *Settled*.
- If this walkthrough finds a problem, record the transaction hash and the exact message the app showed.
