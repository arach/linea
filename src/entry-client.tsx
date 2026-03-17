import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { App } from "@/app";
import type { ReaderDocument } from "@/lib/pdf";
import "@/styles.css";

hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <App initialDocument={window.__INITIAL_STATE__ as ReaderDocument | null} />
  </StrictMode>,
);
