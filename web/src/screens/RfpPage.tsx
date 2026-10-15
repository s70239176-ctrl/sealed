import { useState, type ReactNode } from "react";
import { CONTRACT, appeal, appealInfo, getReceipt, readJury, sendTx, type AppealInfo, type JuryView } from "../lib/chain.ts";
import { describeError } from "../lib/chain.ts";
import { fingerprintText, fingerprintUrl, newSalt, patchBid, priceCommitment, recallBid, recallTxs, rememberBid, rememberTx, type PageFingerprint } from "../lib/commit.ts";
import { formatDate, formatGen, hostOf, shortAddr, timeLeft } from "../lib/format.ts";
import { describeCriterion } from "../lib/templates.ts";
import type { Bid, Rfp, Stage } from "../lib/types.ts";
import { stageOf, useChainClock, useLoad, useTx } from "../hooks.ts";
import { useSession } from "../wallet-context.ts";
import { AddressLink, Empty, Pill, StagePill, Timeline, TxLink, TxStatus } from "../components/Ui.tsx";

const SHORT: Record<string, string> = { contains: "phrase", license: "license", price_max: "price", deliverable: "link", question: "fact" };

export function RfpPage({ id, receipt }: { id: number; receipt: boolean }) {
  const now = useChainClock();
  const data = useLoad(() => getReceipt(id), [id]);
  if (data.loading && !data.data) return <Empty>Loading RFP {id} from the chain…</Empty>;
  if (data.error || !data.data) {
    return <div className="tx err" role="alert">{data.error ?? "Could not load this RFP."} <button className="small ghost" onClick={data.reload}>Retry</button></div>;
  }
  const { rfp, bids } = data.data;
  const stage = stageOf(rfp, now);
  return receipt ? (
    <ReceiptView rfp={rfp} bids={bids} stage={stage} reload={data.reload} />
  ) : (
    <LiveView rfp={rfp} bids={bids} stage={stage} now={now} reload={data.reload} />
  );
}

// ------------------------------------------------------------------ shared pieces
function Terms({ rfp }: { rfp: Rfp }) {
  return (
    <div className="card">
      <h3>Frozen terms</h3>
      <p className="small muted">Set before the first bid. Nobody, including the sponsor, can change them.</p>
      <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
        {rfp.criteria.map((c, i) => <li key={i}>{describeCriterion(c)}</li>)}
      </ol>
      <dl className="kv">
        <dt>Criteria fingerprint</dt><dd className="hash">{rfp.criteriaHash}</dd>
        <dt>Award rule</dt><dd>{rfp.tieRule === "lowest" ? "All bits hit = eligible. Lowest revealed price wins; equal prices split." : "All bits hit = eligible. Eligible bids split the prize."}</dd>
        <dt>If none is eligible</dt><dd>The prize returns to the sponsor, and every bidder gets their bond back.</dd>
        <dt>Prize</dt><dd>{formatGen(rfp.pool)} GEN</dd>
        <dt>Bid bond</dt><dd>{formatGen(rfp.bond)} GEN each. Returned unless someone wins and the bid wasn&rsquo;t eligible; then it joins the prize. The sponsor never receives it.</dd>
        <dt>Sponsor</dt><dd><AddressLink address={rfp.sponsor} /></dd>
      </dl>
    </div>
  );
}

function Header({ rfp, stage, receipt }: { rfp: Rfp; stage: Stage; receipt?: boolean }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div className="row"><StagePill stage={stage} />{rfp.outcome ? <Pill tone={rfp.outcome === "REFUNDED" ? "warn" : "ok"}>{rfp.outcome.toLowerCase()}</Pill> : null}</div>
      <h1 style={{ marginTop: 8 }}>{rfp.title}</h1>
      <div className="row noprint">
        {receipt ? <a href={`#/rfp/${rfp.id}`}>← Back to the RFP</a> : <a href={`#/rfp/${rfp.id}/receipt`}>Open the verifiable receipt →</a>}
      </div>
      <Timeline rfp={rfp} stage={stage} />
    </div>
  );
}

function Outcome({ rfp, bids }: { rfp: Rfp; bids: Bid[] }) {
  if (rfp.status !== "SETTLED") return null;
  const who = (bidId: number) => bids.find((b) => b.id === bidId)?.bidder ?? "";
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Settled {formatDate(rfp.settledAt)}</h3>
      {rfp.outcome === "REFUNDED" ? (
        <p>No bid was eligible. The {formatGen(rfp.pool)} GEN prize returned to the sponsor, and every bond went back to its bidder.</p>
      ) : (
        <>
          <p>
            {rfp.outcome === "SPLIT" ? "The prize was split among" : "The prize went to"} the eligible {rfp.winners.length === 1 ? "bid" : "bids"} below.
            {rfp.forfeited > 0n ? <> It includes {formatGen(rfp.forfeited)} GEN of forfeited bonds from ineligible bids.</> : null}
          </p>
          <ul>
            {rfp.winners.map((w) => (
              <li key={w.bidId}>Bid #{w.bidId} (<AddressLink address={who(w.bidId)} />) received <b>{formatGen(w.amount)} GEN</b></li>
            ))}
          </ul>
        </>
      )}
      <p className="small muted">Payouts are sent when the settling transaction finalizes. No account, including the sponsor&rsquo;s, could change this outcome: it is the award rule applied to the bits below.</p>
    </div>
  );
}

function BitCell({ v }: { v: boolean | undefined }) {
  return <td className={`bit ${v === true ? "y" : v === false ? "n" : "u"}`}>{v === true ? "✓" : v === false ? "✗" : "—"}</td>;
}

function BidMatrix({ rfp, bids, winners, children }: { rfp: Rfp; bids: Bid[]; winners: Set<number>; children?: (b: Bid) => ReactNode }) {
  if (bids.length === 0) return <Empty>No bids were placed.</Empty>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Bid</th><th>Bidder</th><th>Price</th>
            {rfp.criteria.map((c, i) => <th key={i} title={describeCriterion(c)} scope="col">{SHORT[c.kind]}</th>)}
            <th>Result</th>{children ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {bids.map((b) => (
            <tr key={b.id} className={winners.has(b.id) ? "win" : ""}>
              <td>#{b.id}<div className="small muted">{hostOf(b.url, 28)}</div></td>
              <td><AddressLink address={b.bidder} /></td>
              <td>{b.price === null ? <span className="muted">{b.status === "COMMITTED" ? "sealed" : "—"}</span> : b.price.toString()}</td>
              {rfp.criteria.map((_, i) => <BitCell key={i} v={b.bits ? b.bits[i] : undefined} />)}
              <td>
                {b.status === "EVALUATED" ? (
                  b.eligible ? <Pill tone="ok">eligible</Pill> : <Pill tone="bad">{b.source === "changed" ? "page changed" : b.source === "unavailable" ? "page unavailable" : "ineligible"}</Pill>
                ) : b.status === "REVEALED" ? <Pill>revealed</Pill> : <Pill tone="warn">sealed</Pill>}
              </td>
              {children ? <td>{children(b)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ per-bid jury actions
function JuryDetails({ txHash }: { txHash: string }) {
  const { requireSigner } = useSession();
  const [jury, setJury] = useState<JuryView | null>(null);
  const [info, setInfo] = useState<AppealInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setMsg(null);
    try {
      setJury(await readJury(txHash));
      setInfo(await appealInfo(txHash));
    } catch (e) {
      setMsg(describeError(e));
    } finally {
      setBusy(false);
    }
  }
  async function file() {
    const signer = requireSigner();
    if (!signer || !info) return setMsg("Connect a wallet first.");
    setBusy(true);
    try {
      await appeal(signer, txHash, info.charge);
      setMsg("Appeal filed. A fresh set of validators will re-run the evaluation.");
    } catch (e) {
      setMsg(describeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="small" style={{ marginTop: 6 }}>
      <button className="ghost small" onClick={load} disabled={busy}>{jury ? "Refresh jury" : "Show the jury"}</button>
      {jury ? (
        <div style={{ marginTop: 6 }}>
          <div>
            {jury.votes.length === 0 ? <span className="muted">No votes recorded.</span> : jury.votes.map((v) => (
              <span key={v.validator} title={`${shortAddr(v.validator)}: ${v.vote}`} className={`vote ${v.vote.toLowerCase().includes("agree") && !v.vote.toLowerCase().includes("disagree") ? "agree" : v.vote.toLowerCase().includes("disagree") ? "disagree" : ""}`} />
            ))}
            <span className="muted"> {jury.votes.length} validators · round {jury.rounds} · {jury.status.toLowerCase()}{jury.appealed ? " · appealed" : ""}</span>
          </div>
          {info ? (
            info.appealable ? (
              <div style={{ marginTop: 4 }}>
                This evaluation is still inside its appeal window{info.charge ? ` (charge ${formatGen(info.charge)} GEN)` : ""}.{" "}
                {info.fileable ? <button className="small" onClick={file} disabled={busy}>Appeal this evaluation</button> : <span className="muted">Studionet does not accept appeal transactions; on a network with the consensus contracts you could file one here.</span>}
                <div className="muted">An appeal re-runs the same bits with new validators. It never asks anyone which bid they prefer.</div>
              </div>
            ) : <div className="muted" style={{ marginTop: 4 }}>The appeal window for this evaluation has closed.</div>
          ) : null}
        </div>
      ) : null}
      {msg ? <div className="tx" role="status">{msg}</div> : null}
    </div>
  );
}

function BidActions({ rfp, bid, stage, reload, auditOnly }: { rfp: Rfp; bid: Bid; stage: Stage; reload: () => void; auditOnly?: boolean }) {
  const { requireSigner } = useSession();
  const tx = useTx();
  const [hash, setHash] = useState<string>();
  const evalHash = recallTxs(CONTRACT, rfp.id)[`eval:${bid.id}`];

  async function evaluate() {
    const signer = requireSigner();
    if (!signer) return;
    const out = await tx.run((p) => sendTx(signer, "evaluate_bid", [BigInt(bid.id)], 0n, p, (h) => { setHash(h); rememberTx(CONTRACT, rfp.id, `eval:${bid.id}`, h); }));
    if (out && !out.error) reload();
  }
  async function recheck() {
    const signer = requireSigner();
    if (!signer) return;
    const out = await tx.run((p) => sendTx(signer, "recheck_bid", [BigInt(bid.id)], 0n, p, (h) => { setHash(h); rememberTx(CONTRACT, rfp.id, `recheck:${bid.id}`, h); }));
    if (out && !out.error) reload();
  }
  const signerReady = Boolean(requireSigner());
  return (
    <div style={{ minWidth: 190 }}>
      {!auditOnly && stage === "evaluation" && bid.status === "REVEALED" ? (
        <button className="small wax" disabled={tx.busy || !signerReady} title={signerReady ? "" : "Connect a wallet or use the demo account"} onClick={evaluate}>Run the jury</button>
      ) : null}
      {!auditOnly && stage === "evaluation" && bid.status === "COMMITTED" ? <span className="small muted">Never revealed: ineligible</span> : null}
      {bid.status === "EVALUATED" ? (
        <button className="ghost small" disabled={tx.busy || !signerReady} title={signerReady ? "" : "Connect a wallet or use the demo account"} onClick={recheck}>Re-run the check</button>
      ) : null}
      {bid.recheck ? (
        <div className="small" style={{ marginTop: 4 }}>
          <Pill tone={bid.recheck.matches ? "ok" : "warn"}>{bid.recheck.matches ? "re-check matches" : "re-check differs"}</Pill>
          <span className="muted"> ×{bid.recheck.count}{!bid.recheck.matches && bid.recheck.source !== "ok" ? ` (page ${bid.recheck.source} since)` : ""}</span>
        </div>
      ) : null}
      <TxStatus state={tx.state} hash={hash} doneText={(r) => (r ? `Result: ${r}.` : "Done.")} />
      {evalHash ? <JuryDetails txHash={evalHash} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ live view
function LiveView({ rfp, bids, stage, now, reload }: { rfp: Rfp; bids: Bid[]; stage: Stage; now: number; reload: () => void }) {
  const { signer, me } = useSession();
  const mine = bids.find((b) => b.bidder === me);
  const winners = new Set(rfp.winners.map((w) => w.bidId));
  return (
    <>
      <Header rfp={rfp} stage={stage} />
      <Outcome rfp={rfp} bids={bids} />
      <div className="grid" style={{ marginTop: 16 }}>
        <Terms rfp={rfp} />
        <div className="card">
          <h3>{stage === "bidding" ? (mine ? "Your sealed bid" : "Place a sealed bid") : stage === "reveal" ? "Reveal your price" : stage === "evaluation" ? "Evaluation" : "Outcome"}</h3>
          {stage === "bidding" ? <BidPanel rfp={rfp} mine={mine} reload={reload} /> : null}
          {stage === "reveal" ? <RevealPanel rfp={rfp} mine={mine} reload={reload} /> : null}
          {stage === "evaluation" ? <SettlePanel rfp={rfp} bids={bids} reload={reload} /> : null}
          {stage === "settled" ? <p className="muted">This RFP is settled. See the bits below, or open the <a href={`#/rfp/${rfp.id}/receipt`}>verifiable receipt</a>.</p> : null}
          {stage === "bidding" ? <p className="small muted">{timeLeft(rfp.bidDeadline, now)} to bid. Prices stay sealed until bidding closes.</p> : null}
          {stage === "reveal" ? <p className="small muted">{timeLeft(rfp.revealDeadline, now)} to reveal. A bid that is not revealed is ineligible.</p> : null}
          {signer && rfp.sponsor === me ? <p className="small muted">You are the sponsor of this RFP. Sponsors cannot bid, and cannot change anything after locking.</p> : null}
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Bids ({bids.length})</h2>
      <BidMatrix rfp={rfp} bids={bids} winners={winners}>{(b) => <BidActions rfp={rfp} bid={b} stage={stage} reload={reload} />}</BidMatrix>
    </>
  );
}

function NeedSigner() {
  const { connectWallet, useDemoAccount } = useSession();
  return (
    <div className="row">
      <button onClick={connectWallet}>Connect wallet</button>
      <button className="ghost" onClick={useDemoAccount}>Use demo account</button>
    </div>
  );
}

function BidPanel({ rfp, mine, reload }: { rfp: Rfp; mine: Bid | undefined; reload: () => void }) {
  const { signer, me } = useSession();
  const tx = useTx();
  const [hash, setHash] = useState<string>();
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [salt, setSalt] = useState(() => newSalt());
  const [fp, setFp] = useState<PageFingerprint | null>(null);
  const [paste, setPaste] = useState("");
  const [fpBusy, setFpBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!signer) return <NeedSigner />;
  if (rfp.sponsor === me) return <p className="muted">The sponsor cannot bid.</p>;
  if (mine) {
    const mem = recallBid(CONTRACT, rfp.id, me);
    return (
      <>
        <div className="tx ok">Your sealed bid is in. Come back between <b>{formatDate(rfp.bidDeadline)}</b> and <b>{formatDate(rfp.revealDeadline)}</b> to reveal your price.</div>
        {mem ? <p className="small">Your secret word (saved in this browser): <span className="mono">{mem.salt}</span>. Write it down: without it you cannot reveal, and an unrevealed bid is ineligible.</p> : <p className="small muted">This browser does not remember this bid. You need the price and secret word you used to reveal.</p>}
      </>
    );
  }

  async function fetchFp() {
    setFpBusy(true);
    setErr(null);
    try {
      setFp(await fingerprintUrl(url.trim()));
    } catch (e) {
      setFp(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFpBusy(false);
    }
  }
  async function pasteFp() {
    setErr(null);
    try {
      setFp(await fingerprintText(paste));
    } catch (e) {
      setFp(null);
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function submit() {
    setErr(null);
    if (!signer) return;
    const p = Math.trunc(Number(price));
    if (!/^\d+$/.test(price.trim()) || p < 1) return setErr("Enter a whole-number price of at least 1.");
    if (!/^https:\/\//.test(url.trim())) return setErr("Enter the public https URL of your bid page.");
    if (!fp) return setErr("Fingerprint your page first: that is what locks its content.");
    const commit = await priceCommitment(rfp.id, signer.address, p, salt);
    rememberBid(CONTRACT, rfp.id, signer.address, { price: String(p), salt, url: url.trim() });
    const out = await tx.run((onPhase) => sendTx(signer, "submit_bid", [BigInt(rfp.id), url.trim(), commit, fp.hash], rfp.bond, onPhase, (h) => { setHash(h); patchBid(CONTRACT, rfp.id, signer.address, { bidTx: h }); }));
    if (out && !out.error) reload();
  }

  return (
    <>
      <label htmlFor="burl" style={{ marginTop: 0 }}>Your bid page (public https URL)</label>
      <input id="burl" value={url} onChange={(e) => { setUrl(e.target.value); setFp(null); }} placeholder="https://…" />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="ghost small" disabled={fpBusy || !/^https:\/\//.test(url.trim())} onClick={fetchFp}>{fpBusy ? "Reading…" : "Fingerprint this page"}</button>
        <span className="small muted">or paste its source below if the site blocks browsers</span>
      </div>
      <textarea aria-label="Page source" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the page's HTML or text" style={{ marginTop: 8, minHeight: 64 }} />
      <button className="ghost small" disabled={paste.trim() === ""} onClick={pasteFp}>Fingerprint pasted source</button>
      {fp ? <div className="tx ok small">Locked to {fp.chars.toLocaleString("en-US")} characters of page text. If this page changes later, your bid becomes ineligible.<div className="hash">{fp.hash}</div></div> : null}

      <label htmlFor="bprice">Your price (whole units, the same units as any price ceiling)</label>
      <input id="bprice" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
      <label htmlFor="bsalt">Secret word (keeps your price sealed)</label>
      <div className="row"><input id="bsalt" className="grow mono" value={salt} onChange={(e) => setSalt(e.target.value)} /><button className="ghost small" onClick={() => setSalt(newSalt())}>New</button></div>
      <p className="small muted">Only a hash of your price and this word goes on-chain. You will need both to reveal. This browser saves them for you.</p>
      <p className="small">You will post a bond of <b>{formatGen(rfp.bond)} GEN</b>. It comes back unless someone wins and your bid wasn&rsquo;t eligible.</p>
      <button className="wax" disabled={tx.busy} onClick={submit}>Seal my bid and post the bond</button>
      {err ? <div className="tx err" role="alert">{err}</div> : null}
      <TxStatus state={tx.state} hash={hash} doneText={() => "Bid sealed."} />
    </>
  );
}

function RevealPanel({ rfp, mine, reload }: { rfp: Rfp; mine: Bid | undefined; reload: () => void }) {
  const { signer, me } = useSession();
  const tx = useTx();
  const [hash, setHash] = useState<string>();
  const mem = me ? recallBid(CONTRACT, rfp.id, me) : null;
  const [price, setPrice] = useState(mem?.price ?? "");
  const [salt, setSalt] = useState(mem?.salt ?? "");
  const [err, setErr] = useState<string | null>(null);
  if (!signer) return <NeedSigner />;
  if (!mine) return <p className="muted">You have no bid on this RFP, and bidding has closed.</p>;
  if (mine.status !== "COMMITTED") return <div className="tx ok">Your price is revealed: {mine.price?.toString()}. Evaluation starts when the window closes.</div>;
  async function reveal() {
    setErr(null);
    if (!signer || !mine) return;
    if (!/^\d+$/.test(price.trim()) || Number(price) < 1) return setErr("Enter the whole-number price you bid.");
    if (salt.trim() === "") return setErr("Enter your secret word.");
    const local = await priceCommitment(rfp.id, signer.address, BigInt(price.trim()), salt);
    if (local !== mine.priceCommit) return setErr("That price and secret word do not match what you sealed. Nothing was sent.");
    const out = await tx.run((onPhase) => sendTx(signer, "reveal_price", [BigInt(mine.id), BigInt(price.trim()), salt], 0n, onPhase, (h) => { setHash(h); patchBid(CONTRACT, rfp.id, signer.address, { revealTx: h }); }));
    if (out && !out.error) reload();
  }
  return (
    <>
      <label htmlFor="rp" style={{ marginTop: 0 }}>Your price</label>
      <input id="rp" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
      <label htmlFor="rs">Your secret word</label>
      <input id="rs" className="mono" value={salt} onChange={(e) => setSalt(e.target.value)} />
      {!mem ? <p className="small muted">This browser has no saved copy. Enter exactly what you used when you bid.</p> : null}
      <button className="wax" style={{ marginTop: 12 }} disabled={tx.busy} onClick={reveal}>Reveal my price</button>
      {err ? <div className="tx err" role="alert">{err}</div> : null}
      <TxStatus state={tx.state} hash={hash} doneText={() => "Price revealed."} />
    </>
  );
}

function SettlePanel({ rfp, bids, reload }: { rfp: Rfp; bids: Bid[]; reload: () => void }) {
  const { requireSigner } = useSession();
  const tx = useTx();
  const [hash, setHash] = useState<string>();
  const waiting = bids.filter((b) => b.status === "REVEALED").length;
  const signer = requireSigner();
  async function settle() {
    if (!signer) return;
    const out = await tx.run((p) => sendTx(signer, "settle", [BigInt(rfp.id)], 0n, p, (h) => { setHash(h); rememberTx(CONTRACT, rfp.id, "settle", h); }, "finalized"));
    if (out && !out.error) reload();
  }
  return (
    <>
      <p>
        Anyone can run the jury on each revealed bid, then settle. Settlement is pure code over the bits:
        {" "}{waiting > 0 ? <b>{waiting} bid{waiting === 1 ? "" : "s"} still need the jury.</b> : <b>every revealed bid is evaluated.</b>}
      </p>
      {!signer ? <NeedSigner /> : <button className="wax" disabled={tx.busy || waiting > 0} onClick={settle}>Settle the RFP</button>}
      <TxStatus state={tx.state} hash={hash} doneText={(r) => `Settled: ${(r ?? "").toLowerCase()}.`} />
    </>
  );
}

// ------------------------------------------------------------------ receipt
function ReceiptView({ rfp, bids, stage, reload }: { rfp: Rfp; bids: Bid[]; stage: Stage; reload: () => void }) {
  const winners = new Set(rfp.winners.map((w) => w.bidId));
  const txs = recallTxs(CONTRACT, rfp.id);
  return (
    <>
      <Header rfp={rfp} stage={stage} receipt />
      <p className="lead muted">
        Everything below was read from the contract in a single call. Nothing here comes from a database. Share this URL:
        anyone can re-check it.
      </p>
      <Terms rfp={rfp} />
      <h2 style={{ marginTop: 28 }}>What the jury found</h2>
      <BidMatrix rfp={rfp} bids={bids} winners={winners}>{(b) => <BidActions rfp={rfp} bid={b} stage={stage} reload={reload} auditOnly />}</BidMatrix>
      <Outcome rfp={rfp} bids={bids} />
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Check it yourself</h3>
        <ol className="small">
          <li>Re-hash the criteria above and compare with the fingerprint. It was fixed before the first bid.</li>
          <li>Each bid committed to a hash of its page and a sealed price; both are listed in the bid&rsquo;s record on-chain.</li>
          <li>Press <b>Re-run the check</b> on any evaluated bid. Fresh validators fetch the page again and report whether they still see the same bits. A page edited since will show as changed. It never alters the result or the payout.</li>
          <li>Apply the award rule to the table. It is the whole rule: no account holds a vote.</li>
        </ol>
        {Object.keys(txs).length > 0 ? (
          <p className="small">Transactions this browser saw: {Object.entries(txs).map(([k, h]) => <span key={k}>{k} <TxLink hash={h} /> </span>)}</p>
        ) : <p className="small muted">Transaction links appear here for transactions made from this browser; every action is also on the explorer under the contract.</p>}
        <div className="small">Contract <AddressLink address={CONTRACT} />. Per-bid commitments: {bids.map((b) => <span key={b.id} className="mono">#{b.id} {b.contentHash.slice(0, 10)}… </span>)}</div>
        <button className="ghost small noprint" style={{ marginTop: 10 }} onClick={() => window.print()}>Print or save as PDF</button>
      </div>
    </>
  );
}

