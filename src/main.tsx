import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initMonitoring } from "./lib/monitoring";
import { reloadForNewBuild } from "./lib/stale-build";
import "./index.css";

initMonitoring();
// Vite reports a page's code or styles it couldn't preload, which happens in a tab opened before a deploy.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewBuild()) event.preventDefault();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => {
        const status = (e as { status?: number }).status;
        return status !== 401 && status !== 403 && n < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
