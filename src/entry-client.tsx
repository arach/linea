import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { Agentation } from "agentation";

import { App } from "@/app";
import type { ReaderDocument } from "@/lib/pdf";

hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <App initialDocument={window.__INITIAL_STATE__ as ReaderDocument | null} />
    {import.meta.env.DEV && <Agentation />}
  </StrictMode>,
);
