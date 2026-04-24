import type { LineaAuthProvider } from "../../src/lib/linea-access";
import type { LineaVoiceProviderId } from "../../src/lib/linea-voice";

type RequestedAuthProvider = LineaAuthProvider | "auto";

type ManagedAccessConfig = {
  authProvider: LineaAuthProvider;
  authConfigured: boolean;
  clerkConfigured: boolean;
  xConfigured: boolean;
  managedAccessEnabled: boolean;
  localCredentialsEnabled: boolean;
  postgresUrl: string | null;
  ownerEmails: string[];
  allowlistedEmails: string[];
  defaultTtsCharLimit: number | null;
  defaultTranscriptionSecondLimit: number | null;
  xClientId: string | null;
  xClientSecret: string | null;
  xCallbackUrl: string | null;
  sessionSecret: string | null;
  managedApiKeys: Partial<Record<LineaVoiceProviderId, string>>;
};

let cachedConfig: ManagedAccessConfig | null = null;

function parseEmailList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseNullableInteger(value: string | undefined, fallback: number | null) {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseRequestedAuthProvider(value: string | undefined): RequestedAuthProvider {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "x") {
    return "x";
  }

  if (normalized === "clerk") {
    return "clerk";
  }

  if (normalized === "none") {
    return "none";
  }

  return "auto";
}

function resolveAuthProvider(
  requested: RequestedAuthProvider,
  options: { clerkConfigured: boolean; xConfigured: boolean },
): LineaAuthProvider {
  if (requested === "none") {
    return "none";
  }

  if (requested === "clerk") {
    return "clerk";
  }

  if (requested === "x") {
    return "x";
  }

  if (options.clerkConfigured) {
    return "clerk";
  }

  if (options.xConfigured) {
    return "x";
  }

  return "none";
}

export function getManagedAccessConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const managedOpenAIKey = process.env.LINEA_MANAGED_OPENAI_API_KEY?.trim() ?? "";
  const managedElevenLabsKey = process.env.LINEA_MANAGED_ELEVENLABS_API_KEY?.trim() ?? "";
  const clerkConfigured = Boolean(
    process.env.CLERK_PUBLISHABLE_KEY?.trim() && process.env.CLERK_SECRET_KEY?.trim(),
  );
  const xClientId = process.env.LINEA_X_CLIENT_ID?.trim() || null;
  const xClientSecret = process.env.LINEA_X_CLIENT_SECRET?.trim() || null;
  const xCallbackUrl = process.env.LINEA_X_CALLBACK_URL?.trim() || null;
  const sessionSecret = process.env.LINEA_SESSION_SECRET?.trim() || null;
  const xConfigured = Boolean(xClientId && xClientSecret && xCallbackUrl && sessionSecret);
  const authProvider = resolveAuthProvider(
    parseRequestedAuthProvider(process.env.LINEA_AUTH_PROVIDER),
    {
      clerkConfigured,
      xConfigured,
    },
  );
  const authConfigured =
    authProvider === "clerk" ? clerkConfigured : authProvider === "x" ? xConfigured : false;
  const managedAccessEnabled = parseBoolean(process.env.LINEA_MANAGED_ACCESS_ENABLED, false);

  cachedConfig = {
    authProvider,
    authConfigured,
    clerkConfigured,
    xConfigured,
    managedAccessEnabled,
    localCredentialsEnabled: !managedAccessEnabled,
    postgresUrl: process.env.DATABASE_URL?.trim() || null,
    ownerEmails: parseEmailList(process.env.LINEA_OWNER_EMAILS),
    allowlistedEmails: parseEmailList(process.env.LINEA_MANAGED_ALLOWED_EMAILS),
    defaultTtsCharLimit: parseNullableInteger(
      process.env.LINEA_DEFAULT_TTS_CHAR_LIMIT,
      250_000,
    ),
    defaultTranscriptionSecondLimit: parseNullableInteger(
      process.env.LINEA_DEFAULT_TRANSCRIPTION_SECOND_LIMIT,
      7_200,
    ),
    xClientId,
    xClientSecret,
    xCallbackUrl,
    sessionSecret,
    managedApiKeys: {
      openai: managedOpenAIKey || undefined,
      elevenlabs: managedElevenLabsKey || undefined,
    },
  };

  return cachedConfig;
}

export function hasManagedProviderKey(provider: LineaVoiceProviderId) {
  const config = getManagedAccessConfig();
  return Boolean(config.managedApiKeys[provider]);
}

export function hasAnyManagedProviderKey() {
  const config = getManagedAccessConfig();
  return Boolean(config.managedApiKeys.openai || config.managedApiKeys.elevenlabs);
}
