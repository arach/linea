export type LineaAccessRole = "none" | "owner" | "gifted" | "blocked";
export type LineaAccessStatus = "disabled" | "signed-out" | "blocked" | "active";
export type LineaMeteringMode = "disabled" | "memory" | "postgres";
export type LineaAccessSource = "none" | "env-owner" | "env-allowlist" | "postgres";
export type LineaAuthProvider = "none" | "clerk" | "x";

export type LineaQuotaBucket = {
  unit: "chars" | "seconds";
  limit: number | null;
  used: number;
  remaining: number | null;
};

export type LineaQuotaWindow = {
  startsAt: string;
  endsAt: string;
  label: string;
};

export type LineaManagedAccessSnapshot = {
  enabled: boolean;
  authProvider: LineaAuthProvider;
  authConfigured: boolean;
  clerkConfigured: boolean;
  managedKeysConfigured: boolean;
  localCredentialsEnabled: boolean;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    imageUrl: string | null;
  } | null;
  access: {
    status: LineaAccessStatus;
    role: LineaAccessRole;
    source: LineaAccessSource;
    reason: string;
    managedVoice: boolean;
    managedAlignment: boolean;
    meteringMode: LineaMeteringMode;
    quotas: {
      window: LineaQuotaWindow;
      ttsChars: LineaQuotaBucket;
      transcriptionSeconds: LineaQuotaBucket;
    };
  };
};

const EMPTY_ACCESS_SNAPSHOT: LineaManagedAccessSnapshot = {
  enabled: false,
  authProvider: "none",
  authConfigured: false,
  clerkConfigured: false,
  managedKeysConfigured: false,
  localCredentialsEnabled: true,
  user: null,
  access: {
    status: "disabled",
    role: "none",
    source: "none",
    reason: "Managed access is not enabled.",
    managedVoice: false,
    managedAlignment: false,
    meteringMode: "disabled",
    quotas: {
      window: {
        startsAt: new Date(0).toISOString(),
        endsAt: new Date(0).toISOString(),
        label: "This month",
      },
      ttsChars: {
        unit: "chars",
        limit: null,
        used: 0,
        remaining: null,
      },
      transcriptionSeconds: {
        unit: "seconds",
        limit: null,
        used: 0,
        remaining: null,
      },
    },
  },
};

export function getEmptyLineaAccessSnapshot() {
  return EMPTY_ACCESS_SNAPSHOT;
}

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateAlignmentSecondsFromText(text: string, rate = 1) {
  const wordCount = countWords(text);
  if (!wordCount) {
    return 0;
  }

  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return Math.max(1, Math.round(wordCount / (2.6 * safeRate)));
}

export async function fetchLineaAccessSnapshot(options?: { signal?: AbortSignal }) {
  const response = await fetch("/api/access/session", {
    signal: options?.signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not load managed access.");
  }

  const payload = (await response.json()) as { session?: LineaManagedAccessSnapshot };
  return payload.session ?? getEmptyLineaAccessSnapshot();
}
