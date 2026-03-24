import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { Agentation } from "agentation";

import { AppShell } from "@/app-shell";
import type { ReaderDocument } from "@/lib/pdf";

// SPA redirect restore for GitHub Pages 404 fallback
if (!import.meta.env.DEV) {
  const spaRedirect = sessionStorage.getItem("spa-redirect");
  if (spaRedirect) {
    sessionStorage.removeItem("spa-redirect");
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const path = spaRedirect.startsWith(base)
      ? spaRedirect.slice(base.length) || "/"
      : spaRedirect;
    history.replaceState(null, "", path);
  }
}

const root = document.getElementById("root")!;
const hasSSR = root.innerHTML.trim().length > 0;

const tree = (
  <StrictMode>
    <AppShell initialDocument={window.__INITIAL_STATE__ as ReaderDocument | null} />
    {import.meta.env.DEV && <Agentation />}
  </StrictMode>
);

if (hasSSR) {
  hydrateRoot(root, tree);
} else {
  createRoot(root).render(tree);
}
