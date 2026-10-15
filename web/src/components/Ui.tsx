import type { ReactNode } from "react";
import { EXPLORER } from "../lib/chain.ts";
import { formatDate, shortAddr } from "../lib/format.ts";
import type { Phase, Rfp, Stage } from "../lib/types.ts";
import type { TxState } from "../hooks.ts";

export function Pill({ tone, children }: { tone?: "ok" | "bad" | "warn"; children: ReactNode }) {
  return <span className={`pill ${tone ?? ""}`}>{children}</span>;
}

export const stageLabel: Record<Stage, string> = {
  bidding: "Bidding open",
  reveal: "Reveal window",
  evaluation: "Ready to evaluate",
  settled: "Settled",
};

export function StagePill({ stage }: { stage: Stage }) {
  return <Pill tone={stage === "settled" ? "ok" : stage === "bidding" ? "warn" : undefined}>{stageLabel[stage]}</Pill>;
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a className="mono" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      {label ?? `${hash.slice(0, 10)}…`}
    </a>
  );
}

export function AddressLink({ address }: { address: string }) {
  return (
    <a className="mono" href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer" title={address}>
      {shortAddr(address)}
    </a>
  );
}

const phaseText: Record<Phase, string> = {
  signing: "Waiting for your signature…",
  pending: "Submitted. The validators are working…",
  accepted: "Accepted. Waiting for finalization…",
  finalized: "Finalized.",
};

/** One status line for any transaction, with the three outcomes a person needs: running, refused, done. */
export function TxStatus({ state, hash, doneText }: { state: TxState; hash?: string; doneText?: (result?: string) => string }) {
  if (state.kind === "idle") return null;
  if (state.kind === "running") {
    return (
      <div className="tx" role="status">
        {phaseText[state.phase]} {state.detail ? <span className="muted">({state.detail})</span> : null}
        {hash ? <> <TxLink hash={hash} /></> : null}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="tx err" role="alert">
        {state.message}
      </div>
    );
  }
  const o = state.outcome;
  if (o.error) {
    return (
      <div className="tx err" role="alert">
        {o.error} <TxLink hash={o.hash} />
      </div>
    );
  }
  return (
    <div className="tx ok" role="status">
      {doneText ? doneText(o.result) : "Done."} <TxLink hash={o.hash} />
    </div>
  );
}

export function Timeline({ rfp, stage }: { rfp: Rfp; stage: Stage }) {
  const order: Stage[] = ["bidding", "reveal", "evaluation", "settled"];
  const at = order.indexOf(stage);
  const items: { s: Stage; title: string; sub: string }[] = [
    { s: "bidding", title: "1. Bid", sub: `until ${formatDate(rfp.bidDeadline)}` },
    { s: "reveal", title: "2. Reveal prices", sub: `until ${formatDate(rfp.revealDeadline)}` },
    { s: "evaluation", title: "3. Jury evaluates", sub: "anyone can trigger it" },
    { s: "settled", title: "4. Settle", sub: rfp.settledAt ? formatDate(rfp.settledAt) : "payout is code" },
  ];
  return (
    <div className="stages" aria-label="Progress">
      {items.map((it, i) => (
        <div key={it.s} className={`stage ${i < at || stage === "settled" ? "done" : i === at ? "now" : ""}`}>
          {it.title}
          <small>{it.sub}</small>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card muted">{children}</div>;
}
