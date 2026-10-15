import { createContext, useContext } from "react";
import type { Signer } from "./lib/signer.ts";

export interface Session {
  /** Who signs transactions: a browser wallet or the built-in sandbox key. null = read-only. */
  signer: Signer | null;
  /** Lower-case address of the signer, or "" when read-only. */
  me: string;
  connectWallet: () => Promise<void>;
  useDemoAccount: () => void;
  disconnect: () => void;
  /** Ask for a signer from anywhere a write is needed. */
  requireSigner: () => Signer | null;
  error: string | null;
}

export const Ctx = createContext<Session>({
  signer: null,
  me: "",
  connectWallet: async () => {},
  useDemoAccount: () => {},
  disconnect: () => {},
  requireSigner: () => null,
  error: null,
});

export const useSession = () => useContext(Ctx);
