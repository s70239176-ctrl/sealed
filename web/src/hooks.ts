import { useCallback, useEffect, useRef, useState } from "react";
import { chainNow, describeError } from "./lib/chain.ts";
import type { Phase, Stage, Rfp, TxOutcome } from "./lib/types.ts";

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    let live = true;
    setLoading(true);
    loaderRef
      .current()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(describeError(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export type TxState =
  | { kind: "idle" }
  | { kind: "running"; phase: Phase; detail?: string }
  | { kind: "done"; outcome: TxOutcome }
  | { kind: "error"; message: string };

export function useTx() {
  const [state, setState] = useState<TxState>({ kind: "idle" });
  const run = useCallback(
    async (fn: (onPhase: (p: Phase, d?: string) => void) => Promise<TxOutcome>): Promise<TxOutcome | null> => {
      setState({ kind: "running", phase: "signing" });
      try {
        const outcome = await fn((phase, detail) => setState({ kind: "running", phase, detail }));
        setState({ kind: "done", outcome });
        return outcome;
      } catch (e) {
        setState({ kind: "error", message: describeError(e) });
        return null;
      }
    },
    [],
  );
  const reset = useCallback(() => setState({ kind: "idle" }), []);
  return { state, run, busy: state.kind === "running", reset };
}

/** The chain's own clock (the browser clock can be off by tens of seconds), refreshed every 20 s. */
export function useChainClock(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    let live = true;
    let offset = 0;
    const sync = () =>
      chainNow()
        .then((t) => live && (offset = t - Math.floor(Date.now() / 1000)))
        .catch(() => undefined);
    void sync();
    const id = setInterval(() => {
      if (live) setNow(Math.floor(Date.now() / 1000) + offset);
    }, 5000);
    const resync = setInterval(sync, 60000);
    return () => {
      live = false;
      clearInterval(id);
      clearInterval(resync);
    };
  }, []);
  return now;
}

export function stageOf(r: Pick<Rfp, "status" | "bidDeadline" | "revealDeadline">, now: number): Stage {
  if (r.status === "SETTLED") return "settled";
  if (now < r.bidDeadline) return "bidding";
  if (now < r.revealDeadline) return "reveal";
  return "evaluation";
}
