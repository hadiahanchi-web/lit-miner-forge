import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./styles.css";
import "./lib/fonts";
import App from "./App";
import { Web3Provider } from "./lib/web3";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Web3Provider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster richColors closeButton position="top-right" />
      </Web3Provider>
    </QueryClientProvider>
  </StrictMode>,
);
