import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type NativePdfPayload = {
  name: string;
  path: string;
  bytes: ArrayBuffer;
};

const lineaElectron = {
  isDesktop: true,
  pickPdf: () => ipcRenderer.invoke("linea:pick-pdf") as Promise<NativePdfPayload | null>,
  onOpenPdf: (callback: (payload: NativePdfPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: NativePdfPayload) => {
      callback(payload);
    };

    ipcRenderer.on("linea:open-pdf", listener);
    return () => {
      ipcRenderer.removeListener("linea:open-pdf", listener);
    };
  },
};

contextBridge.exposeInMainWorld("lineaElectron", lineaElectron);
