import { useEffect, useRef, useState } from "react";
import { chainNow, dryRun, lintCriteria, sendTx } from "../lib/chain.ts";
import { parseGen } from "../lib/format.ts";
import { KIND_HELP, KIND_LABEL, TEMPLATES, describeCriterion, type Template } from "../lib/templates.ts";
import type { Criterion, CriterionKind, DryRunResult, LintResult } from "../lib/types.ts";
import { useTx } from "../hooks.ts";
import { useSession } from "../wallet-context.ts";
import { TxStatus } from "../components/Ui.tsx";
import { describeError } from "../lib/chain.ts";

/** What the form edits: every field as text, converted to a Criterion only when it is sent to the linter. */
interface Draft {
  kind: CriterionKind;
  text: string;
  allowed: string;
  max: string;
  prefix: string;
}

const blank = (kind: CriterionKind = "contains"): Draft => ({ kind, text: "", allowed: "", max: "", prefix: "https://" });

function fromCriterion(c: Criterion): Draft {
  const d = blank(c.kind);
  if (c.kind === "contains" || c.kind === "question") d.text = c.text;
  if (c.kind === "license") d.allowed = c.allowed.join(", ");
  if (c.kind === "price_max") d.max = String(c.max);
  if (c.kind === "deliverable") d.prefix = c.prefix;
  return d;
}

function toCriterion(d: Draft): Criterion {
  switch (d.kind) {
    case "contains":
    case "question":
      return { kind: d.kind, text: d.text.trim() };
    case "license":
      return { kind: "license", allowed: d.allowed.split(",").map((s) => s.trim()).filter(Boolean) };
    case "price_max":
      return { kind: "price_max", max: Math.trunc(Number(d.max)) || 0 };
    case "deliverable":
      return { kind: "deliverable", prefix: d.prefix.trim() };
  }
}

const BID_WINDOWS: [string, number][] = [
  ["5 minutes (demo)", 300],
  ["1 hour", 3600],
  ["1 day", 86400],
  ["3 days", 3 * 86400],
  ["7 days", 7 * 86400],
  ["14 days", 14 * 86400],
  ["30 days", 30 * 86400],
];
const REVEAL_WINDOWS: [string, number][] = [
  ["3 minutes (demo)", 180],
  ["1 hour", 3600],
  ["6 hours", 6 * 3600],
  ["1 day", 86400],
  ["3 days", 3 * 86400],
];

export function Create() {
  const { requireSigner, useDemoAccount, connectWallet } = useSession();
  const tx = useTx();
  const [hash, setHash] = useState<string>();
  const [template, setTemplate] = useState<Template | null>(null);
  const [title, setTitle] = useState("");
  const [tie, setTie] = useState<"lowest" | "split">("lowest");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [bidWindow, setBidWindow] = useState(86400);
  const [revealWindow, setRevealWindow] = useState(3600);
  const [pool, setPool] = useState("");
  const [bond, setBond] = useState("");
  const [lint, setLint] = useState<LintResult | null>(null);
  const [lintError, setLintError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [samplePrice, setSamplePrice] = useState("1000");
  const [samplePage, setSamplePage] = useState("");
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [dryBusy, setDryBusy] = useState(false);
  const [dryError, setDryError] = useState<string | null>(null);

  const criteria = drafts.map(toCriterion);
  const criteriaKey = JSON.stringify(criteria);

  function pick(t: Template) {
    setTemplate(t);
    setTitle(t.title);
    setTie(t.tieRule);
    setDrafts(t.criteria.map(fromCriterion));
    setDry(null);
  }

  // the contract's own linter, run for free as the sponsor edits
  const seq = useRef(0);
  useEffect(() => {
    if (drafts.length === 0) return;
    const mine = ++seq.current;
    setLintError(null);
    const timer = setTimeout(() => {
      lintCriteria(criteria)
        .then((r) => mine === seq.current && setLint(r))
        .catch((e) => mine === seq.current && (setLint(null), setLintError(describeError(e))));
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteriaKey]);

  function edit(i: number, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    setDry(null);
  }

  async function runDry() {
    setDryBusy(true);
    setDryError(null);
    try {
      setDry(await dryRun(criteria, Math.max(1, Math.trunc(Number(samplePrice)) || 1), samplePage));
    } catch (e) {
      setDry(null);
      setDryError(describeError(e));
    } finally {
      setDryBusy(false);
    }
  }

  async function lock() {
    setFormError(null);
    const signer = requireSigner();
    if (!signer) return setFormError("Connect a wallet, or use the demo account, first.");
    const poolWei = parseGen(pool);
    const bondWei = parseGen(bond);
    if (!title.trim()) return setFormError("Give the RFP a title.");
    if (poolWei === null || poolWei === 0n) return setFormError("Enter the prize pool in GEN, for example 10.");
    if (bondWei === null || bondWei === 0n || bondWei > poolWei) return setFormError("Enter a bond in GEN that is more than 0 and no more than the pool.");
    if (!lint?.ok) return setFormError(lint?.reason ? `Fix the criteria first: ${lint.reason}` : "Wait for the criteria check to finish.");
    const deadline = BigInt((await chainNow()) + bidWindow);
    const out = await tx.run((onPhase) =>
      sendTx(signer, "create_rfp", [title.trim(), JSON.stringify(lint.criteria), tie, deadline, BigInt(revealWindow), bondWei], poolWei, onPhase, setHash),
    );
    if (out && !out.error && out.id) window.location.hash = `#/rfp/${out.id}`;
  }

  if (!template) {
    return (
      <>
        <section className="hero">
          <h1>Start an RFP</h1>
          <p className="lead">Pick a starting point. Every template is only a draft: the contract&rsquo;s own checker reviews it before any funds are locked.</p>
        </section>
        <div className="grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="card link ghost" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => pick(t)}>
              <h3>{t.name}</h3>
              <p className="muted small">{t.blurb}</p>
              {t.criteria.length > 1 ? <p className="small">{t.criteria.map(describeCriterion).join(" · ")}</p> : null}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: "2rem", marginTop: 28 }}>New RFP <button className="ghost small" onClick={() => setTemplate(null)}>Change template</button></h1>

      <div className="card">
        <label htmlFor="title" style={{ marginTop: 0 }}>Title</label>
        <input id="title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <div className="row">
          <div className="grow">
            <label htmlFor="tie">If several bids are eligible</label>
            <select id="tie" value={tie} onChange={(e) => setTie(e.target.value as "lowest" | "split")}>
              <option value="lowest">The lowest revealed price wins (equal prices split)</option>
              <option value="split">Split the prize among all eligible bids</option>
            </select>
          </div>
          <div className="grow">
            <label htmlFor="bw">Bidding stays open for</label>
            <select id="bw" value={bidWindow} onChange={(e) => setBidWindow(Number(e.target.value))}>
              {BID_WINDOWS.map(([l, s]) => <option key={s} value={s}>{l}</option>)}
            </select>
          </div>
          <div className="grow">
            <label htmlFor="rw">Then prices are revealed for</label>
            <select id="rw" value={revealWindow} onChange={(e) => setRevealWindow(Number(e.target.value))}>
              {REVEAL_WINDOWS.map(([l, s]) => <option key={s} value={s}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Criteria</h2>
      <p className="muted small">Each criterion is a bit a page either hits or misses. There is no score. A bid is eligible only if every bit hits.</p>
      {drafts.map((d, i) => (
        <div className="criterion" key={i}>
          <select aria-label={`Criterion ${i + 1} type`} value={d.kind} onChange={(e) => edit(i, { kind: e.target.value as CriterionKind })}>
            {(Object.keys(KIND_LABEL) as CriterionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <div>
            {d.kind === "contains" && <input aria-label="Required phrase" placeholder="Security considerations" value={d.text} onChange={(e) => edit(i, { text: e.target.value })} />}
            {d.kind === "question" && <input aria-label="Yes/no question" placeholder="Does the page name an independent auditor?" value={d.text} onChange={(e) => edit(i, { text: e.target.value })} />}
            {d.kind === "license" && <input aria-label="Allowed licenses" placeholder="MIT, Apache-2.0" value={d.allowed} onChange={(e) => edit(i, { allowed: e.target.value })} />}
            {d.kind === "price_max" && <input aria-label="Price ceiling" inputMode="numeric" placeholder="50000" value={d.max} onChange={(e) => edit(i, { max: e.target.value })} />}
            {d.kind === "deliverable" && <input aria-label="Link prefix" placeholder="https://github.com/" value={d.prefix} onChange={(e) => edit(i, { prefix: e.target.value })} />}
          </div>
          <button className="ghost small" aria-label={`Remove criterion ${i + 1}`} disabled={drafts.length === 1} onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}>Remove</button>
          <div className="help small muted">
            {KIND_HELP[d.kind]}
            {lint?.warnings.filter((w) => w.index === i).map((w) => <div key={w.warning} style={{ color: "var(--warn)" }}>⚠ {w.warning}</div>)}
          </div>
        </div>
      ))}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="ghost small" disabled={drafts.length >= 8} onClick={() => setDrafts((ds) => [...ds, blank()])}>Add a criterion</button>
        <span className="small muted">{drafts.length} of 8</span>
      </div>

      <div style={{ marginTop: 14 }} aria-live="polite">
        {lintError ? <div className="tx err">Could not reach the checker: {lintError}</div> : null}
        {lint && !lint.ok ? <div className="tx err" role="alert">Not accepted: {lint.reason}. The contract would refuse this RFP.</div> : null}
        {lint?.ok ? (
          <div className="tx ok">
            The contract accepts these criteria. Their fingerprint, frozen forever once you lock:
            <div className="hash">{lint.hash}</div>
            {lint.warnings.filter((w) => w.index < 0).map((w) => <div key={w.warning} style={{ color: "var(--warn)" }}>⚠ {w.warning}</div>)}
          </div>
        ) : null}
      </div>

      <h2 style={{ marginTop: 28 }}>Try it on a sample bid</h2>
      <p className="muted small">
        A free dry run with the contract&rsquo;s own code. Paste a sample page and a price to see which bits would hit. Link and
        yes/no criteria need the live web or the jury, so they show &ldquo;needs jury&rdquo; here.
      </p>
      <div className="card">
        <div className="row">
          <div style={{ width: 160 }}>
            <label htmlFor="sp" style={{ marginTop: 0 }}>Sample price</label>
            <input id="sp" inputMode="numeric" value={samplePrice} onChange={(e) => setSamplePrice(e.target.value)} />
          </div>
          <div className="grow">
            <label htmlFor="pg" style={{ marginTop: 0 }}>Sample page (HTML or text)</label>
            <textarea id="pg" value={samplePage} onChange={(e) => setSamplePage(e.target.value)} placeholder="<h2>Security considerations</h2><p>MIT licensed…</p>" />
          </div>
        </div>
        <button className="small" style={{ marginTop: 10 }} disabled={dryBusy || !lint?.ok || samplePage.trim() === ""} onClick={runDry}>{dryBusy ? "Checking…" : "Run dry run"}</button>
        {dryError ? <div className="tx err" role="alert">{dryError}</div> : null}
        {dry?.ok ? (
          <table style={{ marginTop: 12 }}>
            <tbody>
              {criteria.map((c, i) => (
                <tr key={i}>
                  <td className={`bit ${dry.bits[i] === true ? "y" : dry.bits[i] === false ? "n" : "u"}`} style={{ width: 90 }}>
                    {dry.bits[i] === true ? "hit" : dry.bits[i] === false ? "miss" : "needs jury"}
                  </td>
                  <td>{describeCriterion(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <h2 style={{ marginTop: 28 }}>Fund and lock</h2>
      <div className="card">
        <div className="row">
          <div className="grow">
            <label htmlFor="pool" style={{ marginTop: 0 }}>Prize pool (GEN)</label>
            <input id="pool" inputMode="decimal" placeholder="10" value={pool} onChange={(e) => setPool(e.target.value)} />
          </div>
          <div className="grow">
            <label htmlFor="bond" style={{ marginTop: 0 }}>Bid bond (GEN)</label>
            <input id="bond" inputMode="decimal" placeholder="0.5" value={bond} onChange={(e) => setBond(e.target.value)} />
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          Each bidder posts the bond. It comes back unless someone wins and the bid wasn&rsquo;t eligible, in which case it joins the prize.
          You never receive a bond.
        </p>
        <div className="banner">
          Once locked, the criteria, the prize and the award rule <b>cannot be changed or cancelled by anyone, including you.</b> If no
          bid is eligible, the prize returns to you automatically.
        </div>
        <div className="row">
          <button className="wax" disabled={tx.busy} onClick={lock}>Lock {pool || "…"} GEN and open bidding</button>
          {!requireSigner() ? (
            <>
              <button className="ghost" onClick={connectWallet}>Connect wallet</button>
              <button className="ghost" onClick={useDemoAccount}>Use demo account</button>
            </>
          ) : null}
        </div>
        {formError ? <div className="tx err" role="alert">{formError}</div> : null}
        <TxStatus state={tx.state} hash={hash} doneText={() => "RFP created."} />
      </div>
    </>
  );
}
