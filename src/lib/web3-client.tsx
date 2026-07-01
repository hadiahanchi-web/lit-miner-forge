import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider } from "wagmi";
import type { ReactNode } from "react";
import { litForge } from "./chain";

export const wagmiConfig = getDefaultConfig({
  appName: "LiteMiner",
  projectId: "liteminer-liteforge",
  chains: [litForge],
  ssr: false,
});

export function ClientWeb3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
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
