/**
 * A signer is either a browser wallet (EIP-1193, e.g. MetaMask) or a SANDBOX key: a throwaway private key kept in this
 * browser's localStorage so anyone can try Sealed on Studionet without installing a wallet. A sandbox key is for test
 * GEN only; the UI says so wherever it is used.
 */
import { createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export interface Eip1193 {
  request: (a: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (arg: string[]) => void) => void;
}

export type Signer =
  | { kind: "wallet"; address: string }
  | { kind: "sandbox"; address: string; key: `0x${string}` };

const KEY = "sealed:sandbox-key";

export const getProvider = (): Eip1193 | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Eip1193 }).ethereum;

function sandboxFrom(key: string): Signer {
  return { kind: "sandbox", key: key as `0x${string}`, address: createAccount(key as `0x${string}`).address.toLowerCase() };
}

export function loadSandbox(): Signer | null {
  try {
    const key = localStorage.getItem(KEY);
    return key && /^0x[0-9a-fA-F]{64}$/.test(key) ? sandboxFrom(key) : null;
  } catch {
    return null;
  }
}

export function createSandbox(): Signer {
  const key = generatePrivateKey();
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* private mode: the key lives for this tab only */
  }
  return sandboxFrom(key);
}

export function forgetSandbox(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
}

/** The wallet's currently selected account, or null if it is locked or disconnected. */
export async function activeWalletAccount(provider: Eip1193 | undefined = getProvider()): Promise<string | null> {
  if (!provider) return null;
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  return accounts?.[0]?.toLowerCase() ?? null;
}

/** A wallet signs only as its selected account; refuse early, with a plain message, if that changed. */
export async function assertSignerReady(signer: Signer): Promise<void> {
  if (signer.kind === "sandbox") return;
  const active = await activeWalletAccount();
  if (!active) throw new Error("The wallet is locked or disconnected. Unlock it and choose Connect wallet again.");
  if (active !== signer.address) {
    throw new Error("The wallet switched to a different account. Choose Connect wallet to use the new one, or switch back.");
  }
}

const chainIdHex = `0x${studionet.id.toString(16)}`;

/** Ask the wallet for an account, then add and switch to Studionet if it is on another chain. */
export async function connectWallet(provider: Eip1193 | undefined = getProvider()): Promise<Signer> {
  if (!provider) throw new Error("No browser wallet found. Install MetaMask, or use the built-in demo account.");
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("The wallet did not share an account.");
  const current = await provider.request({ method: "eth_chainId" });
  if (String(current).toLowerCase() !== chainIdHex) {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: studionet.name,
          rpcUrls: studionet.rpcUrls.default.http,
          nativeCurrency: studionet.nativeCurrency,
          blockExplorerUrls: studionet.blockExplorers?.default.url ? [studionet.blockExplorers.default.url] : undefined,
        },
      ],
    });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  }
  return { kind: "wallet", address: address.toLowerCase() };
}
