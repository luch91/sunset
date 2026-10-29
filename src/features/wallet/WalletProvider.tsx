import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { NearConnector, type NearWalletBase } from "@hot-labs/near-connect";

type WalletState = {
  accountId: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getWallet: () => Promise<NearWalletBase>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const next = connector ?? new NearConnector({
        network: "testnet",
        features: { testnet: true, signAndSendTransaction: true },
        footerBranding: { heading: "SUNSET", linkText: "Finite-purpose funding", link: window.location.origin }
      });
      setConnector(next);
      const wallet = await next.connect();
      const accounts = await wallet.getAccounts({ network: "testnet" });
      if (!accounts[0]?.accountId) throw new Error("The wallet did not return a Testnet account.");
      setAccountId(accounts[0].accountId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed.");
      throw cause;
    } finally {
      setConnecting(false);
    }
  }, [connector]);

  const disconnect = useCallback(async () => {
    if (connector) await connector.disconnect();
    setAccountId(null);
    setError(null);
  }, [connector]);

  const getWallet = useCallback(async () => {
    if (!connector || !accountId) throw new Error("Connect a NEAR Testnet wallet first.");
    return connector.wallet();
  }, [connector, accountId]);

  const value = useMemo(() => ({ accountId, connecting, error, connect, disconnect, getWallet }), [accountId, connecting, error, connect, disconnect, getWallet]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used within WalletProvider");
  return value;
}
