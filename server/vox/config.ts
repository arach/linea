import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  LineaVoiceCredentialSource,
  LineaVoiceCredentialStatus,
  LineaVoiceProviderId,
} from "../../src/lib/linea-voice";

type ProviderSettings = {
  apiKey?: string;
  voice?: string;
  voiceId?: string;
};

type AppSettings = {
  providers?: {
    openai?: ProviderSettings;
    elevenlabs?: ProviderSettings;
  };
};

const lineaSettingsPath = path.join(os.homedir(), ".config", "linea", "settings.json");
const speakEasySettingsPath = path.join(os.homedir(), ".config", "speakeasy", "settings.json");

let cachedLineaSettings: AppSettings | null | undefined;
let cachedSpeakEasySettings: AppSettings | null | undefined;

const keychainService = "linea.vox";
const keychainNames: Record<LineaVoiceProviderId, string> = {
  openai: "openai-api-key",
  elevenlabs: "elevenlabs-api-key",
};

function loadSettings(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as AppSettings;
  } catch {
    return null;
  }
}

function getLineaSettings() {
  if (cachedLineaSettings === undefined) {
    cachedLineaSettings = loadSettings(lineaSettingsPath);
  }

  return cachedLineaSettings;
}

function getSpeakEasySettings() {
  if (cachedSpeakEasySettings === undefined) {
    cachedSpeakEasySettings = loadSettings(speakEasySettingsPath);
  }

  return cachedSpeakEasySettings;
}

function getProviderSetting(
  provider: "openai" | "elevenlabs",
  key: "apiKey" | "voice" | "voiceId",
) {
  const lineaValue = getLineaSettings()?.providers?.[provider]?.[key];
  if (typeof lineaValue === "string" && lineaValue.length > 0) {
    return lineaValue;
  }

  const speakEasyValue = getSpeakEasySettings()?.providers?.[provider]?.[key];
  if (typeof speakEasyValue === "string" && speakEasyValue.length > 0) {
    return speakEasyValue;
  }

  return "";
}

function getEnvApiKey(provider: LineaVoiceProviderId) {
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY?.trim() ?? "";
  }

  return process.env.ELEVENLABS_API_KEY?.trim() ?? "";
}

function getManagedEnvApiKey(provider: LineaVoiceProviderId) {
  if (provider === "openai") {
    return process.env.LINEA_MANAGED_OPENAI_API_KEY?.trim() ?? "";
  }

  return process.env.LINEA_MANAGED_ELEVENLABS_API_KEY?.trim() ?? "";
}

function getLegacyApiKey(provider: LineaVoiceProviderId) {
  return getProviderSetting(provider, "apiKey").trim();
}

function getBunSecrets() {
  const runtime = globalThis as typeof globalThis & {
    Bun?: {
      secrets?: {
        get(options: { service: string; name: string }): Promise<string | null>;
        set(options: {
          service: string;
          name: string;
          value: string;
          allowUnrestrictedAccess?: boolean;
        }): Promise<void>;
        delete(options: { service: string; name: string }): Promise<boolean>;
      };
    };
  };

  return runtime.Bun?.secrets ?? null;
}

async function getKeychainApiKey(provider: LineaVoiceProviderId) {
  const secrets = getBunSecrets();

  if (!secrets) {
    return "";
  }

  return (await secrets.get({
    service: keychainService,
    name: keychainNames[provider],
  }))?.trim() ?? "";
}

function toCredentialStatus(
  provider: LineaVoiceProviderId,
  source: LineaVoiceCredentialSource,
  value: string,
): LineaVoiceCredentialStatus {
  const normalizedValue = value.trim();

  return {
    provider,
    configured: normalizedValue.length > 0,
    source,
    lastFour: normalizedValue.length >= 4 ? normalizedValue.slice(-4) : null,
  };
}

export async function getProviderApiKey(provider: LineaVoiceProviderId) {
  return getProviderApiKeyWithScope(provider, {
    allowManaged: false,
    allowLocal: true,
  });
}

export async function getProviderApiKeyWithScope(
  provider: LineaVoiceProviderId,
  options?: {
    allowManaged?: boolean;
    allowLocal?: boolean;
  },
) {
  if (options?.allowManaged) {
    const managedKey = getManagedEnvApiKey(provider);
    if (managedKey) {
      return managedKey;
    }
  }

  if (options?.allowLocal === false) {
    return "";
  }

  const envKey = getEnvApiKey(provider);
  if (envKey) {
    return envKey;
  }

  const keychainKey = await getKeychainApiKey(provider);
  if (keychainKey) {
    return keychainKey;
  }

  return getLegacyApiKey(provider);
}

export async function getProviderCredentialStatus(
  provider: LineaVoiceProviderId,
  options?: {
    allowManaged?: boolean;
    allowLocal?: boolean;
  },
): Promise<LineaVoiceCredentialStatus> {
  if (options?.allowManaged) {
    const managedKey = getManagedEnvApiKey(provider);
    if (managedKey) {
      return toCredentialStatus(provider, "managed", managedKey);
    }
  }

  if (options?.allowLocal === false) {
    return toCredentialStatus(provider, options?.allowManaged ? "managed" : null, "");
  }

  const envKey = getEnvApiKey(provider);
  if (envKey) {
    return toCredentialStatus(provider, "environment", envKey);
  }

  const keychainKey = await getKeychainApiKey(provider);
  if (keychainKey) {
    return toCredentialStatus(provider, "keychain", keychainKey);
  }

  const legacyKey = getLegacyApiKey(provider);
  if (legacyKey) {
    return toCredentialStatus(provider, "settings-file", legacyKey);
  }

  return toCredentialStatus(provider, null, "");
}

export async function setProviderApiKey(provider: LineaVoiceProviderId, apiKey: string) {
  const secrets = getBunSecrets();

  if (!secrets) {
    throw new Error("Secure credential storage is unavailable outside the Bun runtime");
  }

  await secrets.set({
    service: keychainService,
    name: keychainNames[provider],
    value: apiKey.trim(),
  });
}

export async function deleteProviderApiKey(provider: LineaVoiceProviderId) {
  const secrets = getBunSecrets();

  if (!secrets) {
    throw new Error("Secure credential storage is unavailable outside the Bun runtime");
  }

  await secrets.delete({
    service: keychainService,
    name: keychainNames[provider],
  });
}

export function getOpenAIVoice() {
  return getProviderSetting("openai", "voice");
}

export function getElevenLabsKey() {
  return getProviderSetting("elevenlabs", "apiKey");
}

export function getElevenLabsVoiceId() {
  return getProviderSetting("elevenlabs", "voiceId");
}

export function getLineaSettingsPath() {
  return lineaSettingsPath;
}
