import { renderToString } from "react-dom/server";

import { AppShell } from "@/app-shell";

export async function render(_url: string) {
  return {
    head: "",
    html: renderToString(<AppShell initialDocument={null} />),
    initialState: null,
  };
}
