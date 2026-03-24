export type DevInspectorSource = "ora" | "vox" | "voxd" | "fabrun";
export type DevInspectorStatus = "started" | "succeeded" | "failed" | "info";

export type DevInspectorEntry = {
  id: string;
  timestamp: string;
  source: DevInspectorSource;
  action: string;
  status: DevInspectorStatus;
  method?: string;
  url?: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
};

const EVENT_NAME = "linea:dev-inspector";
const MAX_ENTRIES = 200;

function isBrowser() {
  return typeof window !== "undefined";
}

function getStore() {
  if (!isBrowser()) {
    return [];
  }

  const w = window as typeof window & { __lineaDevInspector?: DevInspectorEntry[] };
  w.__lineaDevInspector ??= [];
  return w.__lineaDevInspector;
}

export function getDevInspectorEntries() {
  return [...getStore()].reverse();
}

export function recordDevInspectorEntry(entry: Omit<DevInspectorEntry, "id" | "timestamp">) {
  if (!isBrowser()) {
    return;
  }

  const fullEntry: DevInspectorEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  const store = getStore();
  store.push(fullEntry);

  if (store.length > MAX_ENTRIES) {
    store.splice(0, store.length - MAX_ENTRIES);
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: fullEntry }));
}

export function clearDevInspectorEntries() {
  if (!isBrowser()) {
    return;
  }

  const store = getStore();
  store.splice(0, store.length);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: null }));
}

export function subscribeDevInspector(listener: () => void) {
  if (!isBrowser()) {
    return () => {};
  }

  const handler = () => listener();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
