import { renderToString } from "react-dom/server";

import { App } from "@/app";

export async function render(_url: string) {
  return {
    head: "",
    html: renderToString(<App initialDocument={null} />),
    initialState: null,
  };
}
