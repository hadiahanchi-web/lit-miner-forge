import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider } from "wagmi";
import { useEffect, useState, type ReactNode } from "react";
import { litForge } from "./chain";

// Build wagmi config lazily on the client only. The wagmi/rainbowkit/walletconnect
// stack pulls in modules that break under Cloudflare Workers SSR
// ("Class extends value [object Module] is not a constructor").
let _config: ReturnType<typeof getDefaultConfig> | null = null;
function getConfig() {
  if (_config) return _config;
  _config = getDefaultConfig({
    appName: "LiteMiner",
    projectId: "liteminer-liteforge",
    chains: [litForge],
    ssr: false,
  });
  return _config;
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <>{children}</>;

  const config = getConfig();
  return (
    <WagmiProvider config={config}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "#f97316",
          accentColorForeground: "#0b1120",
          borderRadius: "large",
          fontStack: "system",
          overlayBlur: "small",
        })}
        modalSize="compact"
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
