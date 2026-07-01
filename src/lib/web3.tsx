import { lazy, Suspense, type ReactNode } from "react";

// Lazy-load the wagmi + rainbowkit + walletconnect stack so it never enters
// the Cloudflare Workers SSR bundle graph — that stack throws
// "Class extends value [object Module] is not a constructor" under workerd.
const ClientWeb3Provider = lazy(() =>
  import("./web3-client").then((m) => ({ default: m.ClientWeb3Provider })),
);

export function Web3Provider({ children }: { children: ReactNode }) {
  if (typeof window === "undefined") {
    return <>{children}</>;
  }
  return (
    <Suspense fallback={<>{children}</>}>
      <ClientWeb3Provider>{children}</ClientWeb3Provider>
    </Suspense>
  );
}
