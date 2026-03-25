import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  ipcMain,
  shell,
  type MenuItemConstructorOptions,
} from "electron";

type NativePdfPayload = {
  name: string;
  path: string;
  bytes: ArrayBuffer;
};

type StartedLineaServer = {
  port: number;
  close: () => Promise<void>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(__dirname, "preload.js");
const pendingOpenPaths: string[] = [];

let mainWindow: BrowserWindow | null = null;
let lineaServer: StartedLineaServer | null = null;

function getConfiguredStartUrl() {
  const configured = process.env.LINEA_ELECTRON_START_URL?.trim();
  return configured ? configured : null;
}

async function readPdfPayload(filePath: string): Promise<NativePdfPayload> {
  const fileBytes = await fs.readFile(filePath);
  const bytes = fileBytes.buffer.slice(
    fileBytes.byteOffset,
    fileBytes.byteOffset + fileBytes.byteLength,
  );

  return {
    name: path.basename(filePath),
    path: filePath,
    bytes,
  };
}

async function emitPdfToRenderer(window: BrowserWindow, filePath: string) {
  const payload = await readPdfPayload(filePath);
  const send = () => window.webContents.send("linea:open-pdf", payload);

  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once("did-finish-load", send);
    return;
  }

  send();
}

async function promptForPdf(window: BrowserWindow) {
  const result = await dialog.showOpenDialog(window, {
    title: "Open PDF in Linea",
    properties: ["openFile"],
    filters: [
      {
        name: "PDF Documents",
        extensions: ["pdf"],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return readPdfPayload(result.filePaths[0]);
}

async function openPdfFromMenu(window: BrowserWindow) {
  const payload = await promptForPdf(window);
  if (!payload) return;
  window.webContents.send("linea:open-pdf", payload);
}

async function ensureLineaServer() {
  if (lineaServer) {
    return lineaServer;
  }

  const serverEntryUrl = new URL("../index.js", import.meta.url).href;
  const serverModule = await import(serverEntryUrl) as {
    startLineaServer: (options?: {
      host?: string;
      log?: boolean;
      port?: number;
    }) => Promise<StartedLineaServer>;
  };
  const { startLineaServer } = serverModule;

  lineaServer = await startLineaServer({
    host: "127.0.0.1",
    port: 0,
    log: false,
  });

  return lineaServer;
}

function buildMenu(window: BrowserWindow) {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" as const },
              { role: "services" },
              { type: "separator" as const },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" as const },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open PDF...",
          accelerator: "CmdOrCtrl+O",
          click: () => void openPdfFromMenu(window),
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(process.platform === "darwin"
          ? [{ type: "separator" as const }, { role: "front" }, { role: "window" }]
          : [{ role: "close" }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Linea on the web",
          click: () => void shell.openExternal("https://www.uselinea.com"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createMainWindow() {
  const configuredStartUrl = getConfiguredStartUrl();
  const server = configuredStartUrl ? null : await ensureLineaServer();
  const startUrl = configuredStartUrl ?? `http://127.0.0.1:${server!.port}`;

  const window = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: "#f7f0e6",
    title: "Linea",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await window.loadURL(startUrl);
  buildMenu(window);

  for (const filePath of pendingOpenPaths.splice(0)) {
    await emitPdfToRenderer(window, filePath);
  }

  return window;
}

app.setName("Linea");

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    void emitPdfToRenderer(mainWindow, filePath);
    return;
  }
  pendingOpenPaths.push(filePath);
});

ipcMain.handle("linea:pick-pdf", async () => {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!targetWindow) {
    return null;
  }

  return promptForPdf(targetWindow);
});

app.whenReady().then(async () => {
  mainWindow = await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow().then((window) => {
        mainWindow = window;
      });
    }
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    if (lineaServer) {
      await lineaServer.close();
      lineaServer = null;
    }
    app.quit();
  }
});

app.on("before-quit", async () => {
  if (!lineaServer) return;
  await lineaServer.close();
  lineaServer = null;
});
