import { listRfps } from "../lib/chain.ts";
import { formatGen, timeLeft } from "../lib/format.ts";
import { stageOf, useChainClock, useLoad } from "../hooks.ts";
import { Empty, Pill, StagePill } from "../components/Ui.tsx";
import { hasContract } from "../lib/chain.ts";

const STEPS = [
  { t: "Freeze the rules first", d: "The sponsor locks the prize and writes every criterion as a yes/no bit before any bid exists. Anything that needs taste is refused at setup." },
  { t: "Bid in the dark", d: "Bids commit to a sealed price and to their exact page. Nobody can undercut a number they can see, or edit a page after the fact." },
  { t: "A jury checks the bits", d: "Independent validators fetch each page and must agree on the exact bits. Instructions inside a bid are content, never commands." },
  { t: "The payout is code", d: "All bits hit and the bid is eligible. None eligible: the funds return. One: it is paid. Several: lowest price wins, or they split. There is no admin key." },
];

export function Home() {
  const now = useChainClock();
  const list = useLoad(() => listRfps(0, 30), []);
  return (
    <>
      <section className="hero">
        <h1>An RFP the sponsor couldn&rsquo;t steer.</h1>
        <p className="lead">
          Lock the funds, freeze the criteria, and let a jury of validators check every bid against yes/no bits.
          The award is a rule in code, not a decision. Anyone can re-run the check.
        </p>
        <div className="row">
          <a className="btn wax" href="#/create">Create an RFP</a>
          <a className="btn ghost" href="#rfps">Browse RFPs</a>
        </div>
      </section>

      <section className="grid" aria-label="How it works">
        {STEPS.map((s, i) => (
          <div className="card" key={s.t}>
            <h3>{i + 1}. {s.t}</h3>
            <p className="muted small">{s.d}</p>
          </div>
        ))}
      </section>

      <h2 id="rfps" style={{ marginTop: 36 }}>RFPs</h2>
      {!hasContract ? null : list.loading && !list.data ? (
        <Empty>Loading from the chain…</Empty>
      ) : list.error ? (
        <div className="tx err" role="alert">{list.error} <button className="small ghost" onClick={list.reload}>Retry</button></div>
      ) : list.data && list.data.items.length === 0 ? (
        <Empty>No RFPs yet. Be the first to <a href="#/create">create one</a>.</Empty>
      ) : (
        <div className="grid">
          {list.data?.items.map((r) => {
            const stage = stageOf(r, now);
            return (
              <a className="card link" key={r.id} href={`#/rfp/${r.id}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <StagePill stage={stage} />
                  {stage === "settled" && r.outcome ? <Pill tone={r.outcome === "REFUNDED" ? "warn" : "ok"}>{r.outcome.toLowerCase()}</Pill> : null}
                </div>
                <h3 style={{ marginTop: 10 }}>{r.title}</h3>
                <div className="small muted">
                  Prize {formatGen(r.pool)} GEN · {r.bidCount} bid{r.bidCount === 1 ? "" : "s"} · {r.criteriaCount} criteria ·{" "}
                  {r.tieRule === "lowest" ? "lowest price wins" : "split among eligible"}
                </div>
                {stage === "bidding" ? <div className="small" style={{ marginTop: 6 }}>{timeLeft(r.bidDeadline, now)} to bid</div> : null}
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
