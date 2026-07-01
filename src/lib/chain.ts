import { defineChain } from "viem";

export const litForge = defineChain({
  id: 4441,
  name: "LitVM LiteForge Testnet",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://liteforge.rpc.caldera.xyz/http"] },
  },
  blockExplorers: {
    default: { name: "LiteForge Explorer", url: "https://liteforge.explorer.caldera.xyz" },
  },
  testnet: true,
});
