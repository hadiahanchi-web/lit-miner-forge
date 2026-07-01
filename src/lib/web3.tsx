import { lazy, Suspense, type ReactNode } from "react";

// Lazy-load the wagmi + rainbowkit + walletconnect stack so it never enters
// the Cloudflare Workers SSR bundle graph — that stack throws
// "Class extends value [object Module] is not a constructor" under workerd.
const ClientWeb3Provider = lazy(() =>
  import("./web3-client").then((m) => ({ default: m.ClientWeb3Provider })),
);

function SsrShell() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div className="glass max-w-md rounded-3xl p-10">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-400 to-orange-500 shadow-lg shadow-sky-500/30" />
        <h1 className="font-display text-2xl font-bold">LiteMiner</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Loading on-chain mining interface…
        </p>
      </div>
    </div>
  );
}

export function Web3Provider({ children }: { children: ReactNode }) {
  if (typeof window === "undefined") {
    // Skip the entire wagmi tree on the server — every consumer uses wagmi
    // hooks, which would throw without a provider.
    return <SsrShell />;
  }
  return (
    <Suspense fallback={<SsrShell />}>
      <ClientWeb3Provider>{children}</ClientWeb3Provider>
    </Suspense>
  );
}
