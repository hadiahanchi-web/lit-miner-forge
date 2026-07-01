import { defineChain } from "viem";

export const litForge = defineChain({
  id: 4441,
  name: "LitVM LiteForge Testnet",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.liteforge.network"] },
  },
  blockExplorers: {
    default: { name: "LiteForge Explorer", url: "https://explorer.liteforge.network" },
  },
  testnet: true,
});
