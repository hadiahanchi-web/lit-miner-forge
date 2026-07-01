import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import "@/lib/fonts";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Web3Provider } from "@/lib/web3";
import { Toaster } from "@/components/ui/sonner";
import { TopBar } from "@/components/TopBar";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <h1 className="font-display text-6xl font-bold neon-blue">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This shaft leads nowhere.</p>
        <a href="/" className="btn-neon mt-6 inline-flex rounded-xl px-4 py-2 text-sm">
          Back to mine
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <h1 className="font-display text-xl font-semibold">Rig malfunction</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="btn-neon mt-6 rounded-xl px-4 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LiteMiner — zkLTC Mining on LitVM LiteForge" },
      {
        name: "description",
        content:
          "Buy on-chain miners, earn zkLTC rewards continuously, and climb the leaderboard on the LitVM LiteForge testnet.",
      },
      { property: "og:title", content: "LiteMiner — zkLTC Mining on LitVM LiteForge" },
      {
        property: "og:description",
        content:
          "A modern Web3 mining simulation powered by smart contracts on LitVM LiteForge (chain 4441).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "LiteMiner — zkLTC Mining on LitVM LiteForge" },
      { name: "description", content: "LiteMiner is a Web3 browser game where players buy virtual mining machines with zkLTC to earn rewards." },
      { property: "og:description", content: "LiteMiner is a Web3 browser game where players buy virtual mining machines with zkLTC to earn rewards." },
      { name: "twitter:description", content: "LiteMiner is a Web3 browser game where players buy virtual mining machines with zkLTC to earn rewards." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/409d985c-4c03-453a-a100-0a7372cdd3ef/id-preview-ab67b245--dc48a061-4f36-4943-b838-dcb26039be93.lovable.app-1782910738988.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/409d985c-4c03-453a-a100-0a7372cdd3ef/id-preview-ab67b245--dc48a061-4f36-4943-b838-dcb26039be93.lovable.app-1782910738988.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Web3Provider>
        <div className="min-h-screen">
          <TopBar />
          <Outlet />
        </div>
        <Toaster richColors closeButton position="top-right" />
      </Web3Provider>
    </QueryClientProvider>
  );
}
