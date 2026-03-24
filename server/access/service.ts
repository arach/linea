import type { Request } from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";

import {
  estimateAlignmentSecondsFromText,
  type LineaAccessSource,
  type LineaManagedAccessSnapshot,
} from "../../src/lib/linea-access";
import { getManagedAccessConfig, hasAnyManagedProviderKey } from "./config";
import { LineaAccessStore, type StoredAccessGrant, type UsageEvent } from "./store";

type AccessCapability = "managed-voice" | "managed-alignment";

type LineaUserProfile = NonNullable<LineaManagedAccessSnapshot["user"]>;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function createQuotaBucket(
  unit: "chars" | "seconds",
  limit: number | null,
  used: number,
) {
  return {
    unit,
    limit,
    used,
    remaining: limit == null ? null : Math.max(0, limit - used),
  } as const;
}

function getWindowBounds() {
  const now = new Date();
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    label: now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

function getPrimaryEmail(user: {
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id?: string | null; emailAddress?: string | null }>;
}) {
  const primary = user.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId);
  const fallback = user.emailAddresses?.[0];
  const nextEmail = primary?.emailAddress ?? fallback?.emailAddress ?? null;
  return typeof nextEmail === "string" && nextEmail.trim().length > 0
    ? normalizeEmail(nextEmail)
    : null;
}

function createDisabledSnapshot(
  overrides?: Partial<LineaManagedAccessSnapshot>,
): LineaManagedAccessSnapshot {
  const window = getWindowBounds();

  return {
    enabled: false,
    clerkConfigured: false,
    managedKeysConfigured: hasAnyManagedProviderKey(),
    localCredentialsEnabled: !getManagedAccessConfig().managedAccessEnabled,
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
        window,
        ttsChars: createQuotaBucket("chars", null, 0),
        transcriptionSeconds: createQuotaBucket("seconds", null, 0),
      },
    },
    ...overrides,
  };
}

function toGrantFromEnv(email: string): StoredAccessGrant | null {
  const config = getManagedAccessConfig();

  if (config.ownerEmails.includes(email)) {
    return {
      email,
      role: "owner",
      source: "postgres",
      managedVoiceEnabled: true,
      managedAlignmentEnabled: true,
      monthlyTtsCharLimit: null,
      monthlyTranscriptionSecondLimit: null,
      expiresAt: null,
    };
  }

  if (config.allowlistedEmails.includes(email)) {
    return {
      email,
      role: "gifted",
      source: "postgres",
      managedVoiceEnabled: true,
      managedAlignmentEnabled: true,
      monthlyTtsCharLimit: config.defaultTtsCharLimit,
      monthlyTranscriptionSecondLimit: config.defaultTranscriptionSecondLimit,
      expiresAt: null,
    };
  }

  return null;
}

function resolveGrantSource(grant: StoredAccessGrant | null): LineaAccessSource {
  if (!grant) {
    return "none";
  }

  if (grant.role === "owner" && getManagedAccessConfig().ownerEmails.includes(grant.email)) {
    return "env-owner";
  }

  if (grant.role === "gifted" && getManagedAccessConfig().allowlistedEmails.includes(grant.email)) {
    return "env-allowlist";
  }

  return "postgres";
}

function grantHasExpired(grant: StoredAccessGrant | null) {
  if (!grant?.expiresAt) {
    return false;
  }

  return new Date(grant.expiresAt).getTime() <= Date.now();
}

export class LineaAccessError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class LineaAccessService {
  private store = new LineaAccessStore();

  middleware() {
    if (!getManagedAccessConfig().clerkConfigured) {
      return (_req: Request, _res: unknown, next: () => void) => next();
    }

    return clerkMiddleware();
  }

  async getSessionSnapshot(req: Request): Promise<LineaManagedAccessSnapshot> {
    const config = getManagedAccessConfig();

    if (!config.managedAccessEnabled) {
      return createDisabledSnapshot({
        clerkConfigured: config.clerkConfigured,
        managedKeysConfigured: hasAnyManagedProviderKey(),
        localCredentialsEnabled: config.localCredentialsEnabled,
      });
    }

    if (!config.clerkConfigured) {
      return createDisabledSnapshot({
        enabled: false,
        clerkConfigured: false,
        managedKeysConfigured: hasAnyManagedProviderKey(),
        localCredentialsEnabled: config.localCredentialsEnabled,
        access: {
          ...createDisabledSnapshot().access,
          reason: "Clerk is not configured on the server.",
        },
      });
    }

    const auth = getAuth(req);
    const userId = auth.userId ?? null;
    const window = getWindowBounds();
    const baseSnapshot = createDisabledSnapshot({
      enabled: true,
      clerkConfigured: true,
      managedKeysConfigured: hasAnyManagedProviderKey(),
      localCredentialsEnabled: config.localCredentialsEnabled,
      access: {
        status: "signed-out",
        role: "none",
        source: "none",
        reason: "Sign in to use managed voice and alignment.",
        managedVoice: false,
        managedAlignment: false,
        meteringMode: this.store.getMeteringMode(),
        quotas: {
          window,
          ttsChars: createQuotaBucket("chars", config.defaultTtsCharLimit, 0),
          transcriptionSeconds: createQuotaBucket(
            "seconds",
            config.defaultTranscriptionSecondLimit,
            0,
          ),
        },
      },
    });

    if (!userId) {
      return baseSnapshot;
    }

    const user = (await clerkClient.users.getUser(userId).catch(() => null)) as
      | {
          id: string;
          firstName?: string | null;
          imageUrl?: string | null;
          primaryEmailAddressId?: string | null;
          emailAddresses?: Array<{ id?: string | null; emailAddress?: string | null }>;
        }
      | null;

    const profile: LineaUserProfile = {
      id: user?.id ?? userId,
      email: user ? getPrimaryEmail(user) : null,
      firstName: user?.firstName ?? null,
      imageUrl: user?.imageUrl ?? null,
    };

    if (!profile.email) {
      return {
        ...baseSnapshot,
        user: profile,
        access: {
          ...baseSnapshot.access,
          status: "blocked",
          role: "blocked",
          reason: "This account does not expose a usable primary email address.",
        },
      };
    }

    const envGrant = toGrantFromEnv(profile.email);
    const databaseGrant = envGrant ? null : await this.store.getGrantByEmail(profile.email);
    const grant = envGrant ?? databaseGrant;
    const usage = grant
      ? await this.store.getUsageSummary(profile.email, window.startsAt)
      : { ttsChars: 0, transcriptionSeconds: 0 };

    const ttsChars = createQuotaBucket("chars", grant?.monthlyTtsCharLimit ?? config.defaultTtsCharLimit, usage.ttsChars);
    const transcriptionSeconds = createQuotaBucket(
      "seconds",
      grant?.monthlyTranscriptionSecondLimit ?? config.defaultTranscriptionSecondLimit,
      usage.transcriptionSeconds,
    );

    if (!grant) {
      return {
        ...baseSnapshot,
        user: profile,
        access: {
          status: "blocked",
          role: "blocked",
          source: "none",
          reason: `The signed-in email ${profile.email} has not been granted shared access yet.`,
          managedVoice: false,
          managedAlignment: false,
          meteringMode: this.store.getMeteringMode(),
          quotas: {
            window,
            ttsChars,
            transcriptionSeconds,
          },
        },
      };
    }

    if (grantHasExpired(grant)) {
      return {
        ...baseSnapshot,
        user: profile,
        access: {
          status: "blocked",
          role: "blocked",
          source: resolveGrantSource(grant),
          reason: "This shared-access grant has expired.",
          managedVoice: false,
          managedAlignment: false,
          meteringMode: this.store.getMeteringMode(),
          quotas: {
            window,
            ttsChars,
            transcriptionSeconds,
          },
        },
      };
    }

    const canUseVoice =
      grant.managedVoiceEnabled && (ttsChars.remaining == null || ttsChars.remaining > 0);
    const canUseAlignment =
      grant.managedAlignmentEnabled &&
      (transcriptionSeconds.remaining == null || transcriptionSeconds.remaining > 0);

    return {
      enabled: true,
      clerkConfigured: true,
      managedKeysConfigured: hasAnyManagedProviderKey(),
      localCredentialsEnabled: config.localCredentialsEnabled,
      user: profile,
      access: {
        status: grant.role === "blocked" ? "blocked" : "active",
        role: grant.role,
        source: resolveGrantSource(grant),
        reason:
          grant.role === "owner"
            ? "Owner access is active."
            : grant.role === "gifted"
              ? "Shared access is active."
              : "This account is currently blocked.",
        managedVoice: grant.role !== "blocked" && canUseVoice,
        managedAlignment: grant.role !== "blocked" && canUseAlignment,
        meteringMode: this.store.getMeteringMode(),
        quotas: {
          window,
          ttsChars,
          transcriptionSeconds,
        },
      },
    };
  }

  async getCredentialScope(req: Request) {
    if (!getManagedAccessConfig().managedAccessEnabled) {
      return {
        allowManagedCredentials: false,
        allowLocalCredentials: true,
      };
    }

    const snapshot = await this.getSessionSnapshot(req);

    return {
      allowManagedCredentials: snapshot.access.status === "active",
      allowLocalCredentials: false,
    };
  }

  async assertCapability(
    req: Request,
    capability: AccessCapability,
    estimatedUnits = 0,
  ) {
    const snapshot = await this.getSessionSnapshot(req);

    if (!snapshot.enabled) {
      return snapshot;
    }

    if (snapshot.access.status === "signed-out") {
      throw new LineaAccessError(snapshot.access.reason, 401, "auth_required");
    }

    if (snapshot.access.status !== "active" || !snapshot.user?.email) {
      throw new LineaAccessError(snapshot.access.reason, 403, "access_denied");
    }

    if (capability === "managed-voice") {
      if (!snapshot.access.managedVoice) {
        throw new LineaAccessError("Managed voice is not enabled for this account.", 403, "voice_denied");
      }

      const remaining = snapshot.access.quotas.ttsChars.remaining;
      if (remaining != null && estimatedUnits > remaining) {
        throw new LineaAccessError("The shared TTS quota has been exhausted for this account.", 429, "tts_quota_exhausted");
      }
    }

    if (capability === "managed-alignment") {
      if (!snapshot.access.managedAlignment) {
        throw new LineaAccessError(
          "Managed transcription is not enabled for this account.",
          403,
          "alignment_denied",
        );
      }

      const remaining = snapshot.access.quotas.transcriptionSeconds.remaining;
      if (remaining != null && estimatedUnits > remaining) {
        throw new LineaAccessError(
          "The shared transcription quota has been exhausted for this account.",
          429,
          "alignment_quota_exhausted",
        );
      }
    }

    return snapshot;
  }

  async recordManagedUsage(
    snapshot: LineaManagedAccessSnapshot,
    input: Omit<UsageEvent, "email" | "clerkUserId">,
  ) {
    if (!snapshot.enabled || snapshot.access.status !== "active" || !snapshot.user?.email) {
      return;
    }

    await this.store.recordUsage({
      ...input,
      email: snapshot.user.email,
      clerkUserId: snapshot.user.id,
    });
  }

  estimateAlignmentSeconds(text: string, rate = 1) {
    return estimateAlignmentSecondsFromText(text, rate);
  }
}
