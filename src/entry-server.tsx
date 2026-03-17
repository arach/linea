import { renderToString } from "react-dom/server";

import { App } from "@/app";
import "@/styles.css";

export async function render(_url: string) {
  const initialState = null;

  return {
    head: "",
    html: renderToString(<App initialDocument={initialState} />),
    initialState,
  };
}
