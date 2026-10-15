import { useCallback, useEffect, useMemo, useState } from "react";
import { Ctx, type Session } from "./wallet-context.ts";
import { connectWallet, createSandbox, forgetSandbox, getProvider, loadSandbox, type Signer } from "./lib/signer.ts";
import { CONTRACT, NETWORK, describeError, hasContract } from "./lib/chain.ts";
import { AddressLink } from "./components/Ui.tsx";
import { Home } from "./screens/Home.tsx";
import { Create } from "./screens/Create.tsx";
import { RfpPage } from "./screens/RfpPage.tsx";

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash || "#/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

/** Routes (hash-based, so deep links work on any static host):  #/   #/create   #/rfp/:id[/receipt] */
export function App() {
  const hash = useHashRoute();
  const [signer, setSigner] = useState<Signer | null>(() => loadSandbox());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProvider()?.on?.("accountsChanged", (a) => {
      setSigner((cur) => (cur?.kind === "wallet" ? (a[0] ? { kind: "wallet", address: a[0].toLowerCase() } : null) : cur));
    });
  }, []);

  const doConnect = useCallback(async () => {
    try {
      setError(null);
      setSigner(await connectWallet());
    } catch (e) {
      setError(describeError(e));
    }
  }, []);
  const useDemoAccount = useCallback(() => {
    setError(null);
    setSigner(loadSandbox() ?? createSandbox());
  }, []);
  const disconnect = useCallback(() => {
    if (signer?.kind === "sandbox") forgetSandbox();
    setSigner(null);
  }, [signer]);

  const session: Session = useMemo(
    () => ({ signer, me: signer?.address ?? "", connectWallet: doConnect, useDemoAccount, disconnect, requireSigner: () => signer, error }),
    [signer, doConnect, useDemoAccount, disconnect, error],
  );

  const parts = hash.replace(/^#\/?/, "").split("/");
  const route = parts[0];
  let page = <Home />;
  let active = "home";
  if (route === "create") {
    page = <Create />;
    active = "create";
  } else if (route === "rfp" && parts[1]) {
    page = <RfpPage id={Number(parts[1])} receipt={parts[2] === "receipt"} />;
    active = "rfp";
  }

  return (
    <Ctx.Provider value={session}>
      <header className="nav">
        <div className="in">
          <a className="brand" href="#/">
            <span className="seal" aria-hidden="true" /> Sealed
          </a>
          <a className={`link ${active === "home" ? "on" : ""}`} href="#/">RFPs</a>
          <a className={`link ${active === "create" ? "on" : ""}`} href="#/create">New RFP</a>
          <span className="spacer" />
          {signer ? (
            <>
              <span className="small muted">
                {signer.kind === "sandbox" ? "Demo account " : "Wallet "}
                <AddressLink address={signer.address} />
              </span>
              <button className="ghost small" onClick={disconnect}>Disconnect</button>
            </>
          ) : (
            <>
              <button className="small" onClick={doConnect}>Connect wallet</button>
              <button className="ghost small" onClick={useDemoAccount}>Use demo account</button>
            </>
          )}
        </div>
      </header>
      <main className="wrap">
        {error && <div className="tx err" role="alert">{error}</div>}
        {!hasContract && (
          <div className="tx err" role="alert">
            No contract is configured. Set <span className="mono">VITE_CONTRACT_ADDRESS</span> to a deployed Sealed address on Studionet.
          </div>
        )}
        {signer?.kind === "sandbox" && (
          <div className="banner">
            <b>Demo account.</b> A throwaway key stored in this browser, for Studionet test GEN only. Never send real funds to it.
          </div>
        )}
        {page}
      </main>
      <footer>
        Sealed runs on {NETWORK}, a test network. {hasContract && (<>Contract <AddressLink address={CONTRACT} />. </>)}
        The page only sends what the contract asks for and shows what it answers; it decides nothing.
      </footer>
    </Ctx.Provider>
  );
}
