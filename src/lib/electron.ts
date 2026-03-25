import type { ReaderDocument } from "@/lib/pdf";

export type LineaElectronPdfPayload = {
  name: string;
  path: string;
  bytes: ArrayBuffer;
};

export type LineaElectronBridge = {
  isDesktop: true;
  pickPdf: () => Promise<LineaElectronPdfPayload | null>;
  onOpenPdf: (callback: (payload: LineaElectronPdfPayload) => void) => () => void;
};

export function getLineaElectron() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.lineaElectron ?? null;
}

export function isElectronApp() {
  return Boolean(getLineaElectron());
}

export function electronPayloadToFile(payload: LineaElectronPdfPayload) {
  return new File([payload.bytes], payload.name, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

export function electronPayloadToSource(
  payload: LineaElectronPdfPayload,
): ReaderDocument["source"] {
  return {
    localPath: payload.path,
  };
}
