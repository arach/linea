import crypto from "node:crypto";

import postgres from "postgres";

import type { LineaAccessRole, LineaMeteringMode } from "../../src/lib/linea-access";
import { getManagedAccessConfig } from "./config";

export type StoredAccessGrant = {
  email: string;
  role: Exclude<LineaAccessRole, "none">;
  source: "postgres";
  managedVoiceEnabled: boolean;
  managedAlignmentEnabled: boolean;
  monthlyTtsCharLimit: number | null;
  monthlyTranscriptionSecondLimit: number | null;
  expiresAt: string | null;
};

export type UsageSummary = {
  ttsChars: number;
  transcriptionSeconds: number;
};

export type ExplainUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type UsageEvent = {
  email: string;
  clerkUserId: string | null;
  kind: "tts_chars" | "transcription_seconds";
  units: number;
  provider?: string | null;
  cacheKey?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

type MemoryUsageEvent = UsageEvent & {
  createdAt: string;
};

export type ExplainUsageEvent = {
  email: string;
  clerkUserId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, string | number | boolean | null>;
};

type MemoryExplainUsageEvent = ExplainUsageEvent & {
  createdAt: string;
};

type DatabaseGrantRow = {
  email: string;
  role: Exclude<LineaAccessRole, "none">;
  managed_voice_enabled: boolean | null;
  managed_alignment_enabled: boolean | null;
  monthly_tts_char_limit: number | null;
  monthly_transcription_second_limit: number | null;
  expires_at: string | Date | null;
};

type DatabaseUsageSummaryRow = {
  tts_chars: string | number | null;
  transcription_seconds: string | number | null;
};

const memoryUsageEvents = new Map<string, MemoryUsageEvent[]>();
const memoryExplainUsageEvents = new Map<string, MemoryExplainUsageEvent[]>();

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function shouldUseMemoryFallback() {
  return process.env.NODE_ENV !== "production";
}

export class LineaAccessStore {
  private sql =
    getManagedAccessConfig().postgresUrl != null
      ? postgres(getManagedAccessConfig().postgresUrl as string, {
          max: 1,
          prepare: false,
        })
      : null;

  private warnedDatabaseError = false;
  private llmUsageTableEnsured = false;
  private llmUsageTablePromise: Promise<void> | null = null;

  getMeteringMode(): LineaMeteringMode {
    if (this.sql) {
      return "postgres";
    }

    return shouldUseMemoryFallback() ? "memory" : "disabled";
  }

  async getGrantByEmail(email: string) {
    if (!this.sql) {
      return null;
    }

    try {
      const rows = await this.sql<DatabaseGrantRow[]>`
        select
          email,
          role,
          managed_voice_enabled,
          managed_alignment_enabled,
          monthly_tts_char_limit,
          monthly_transcription_second_limit,
          expires_at
        from linea_access_grants
        where lower(email) = lower(${email})
        limit 1
      `;

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        email: normalizeEmail(row.email),
        role: row.role,
        source: "postgres" as const,
        managedVoiceEnabled: row.managed_voice_enabled ?? row.role !== "blocked",
        managedAlignmentEnabled: row.managed_alignment_enabled ?? row.role !== "blocked",
        monthlyTtsCharLimit: row.monthly_tts_char_limit,
        monthlyTranscriptionSecondLimit: row.monthly_transcription_second_limit,
        expiresAt:
          row.expires_at instanceof Date
            ? row.expires_at.toISOString()
            : typeof row.expires_at === "string"
              ? row.expires_at
              : null,
      } satisfies StoredAccessGrant;
    } catch (error) {
      this.warnDatabaseError("grant lookup", error);
      return null;
    }
  }

  async getUsageSummary(email: string, startsAt: string): Promise<UsageSummary> {
    const normalizedEmail = normalizeEmail(email);

    if (this.sql) {
      try {
        const rows = await this.sql<DatabaseUsageSummaryRow[]>`
          select
            coalesce(sum(case when kind = 'tts_chars' then units else 0 end), 0) as tts_chars,
            coalesce(sum(case when kind = 'transcription_seconds' then units else 0 end), 0) as transcription_seconds
          from linea_usage_events
          where lower(email) = lower(${normalizedEmail})
            and created_at >= ${startsAt}
        `;

        const row = rows[0];

        return {
          ttsChars: toNumber(row?.tts_chars),
          transcriptionSeconds: toNumber(row?.transcription_seconds),
        };
      } catch (error) {
        this.warnDatabaseError("usage summary", error);
      }
    }

    if (!shouldUseMemoryFallback()) {
      return { ttsChars: 0, transcriptionSeconds: 0 };
    }

    const windowStart = new Date(startsAt).getTime();
    const events = memoryUsageEvents.get(normalizedEmail) ?? [];

    return events.reduce<UsageSummary>(
      (summary, event) => {
        if (new Date(event.createdAt).getTime() < windowStart) {
          return summary;
        }

        if (event.kind === "tts_chars") {
          return {
            ...summary,
            ttsChars: summary.ttsChars + event.units,
          };
        }

        return {
          ...summary,
          transcriptionSeconds: summary.transcriptionSeconds + event.units,
        };
      },
      { ttsChars: 0, transcriptionSeconds: 0 },
    );
  }

  async recordUsage(event: UsageEvent) {
    const normalizedEmail = normalizeEmail(event.email);
    const nextUnits = Math.max(0, Math.round(event.units));

    if (nextUnits === 0) {
      return;
    }

    if (this.sql) {
      try {
        await this.sql`
          insert into linea_usage_events (
            id,
            email,
            clerk_user_id,
            kind,
            units,
            provider,
            cache_key,
            metadata,
            created_at
          ) values (
            ${crypto.randomUUID()},
            ${normalizedEmail},
            ${event.clerkUserId},
            ${event.kind},
            ${nextUnits},
            ${event.provider ?? null},
            ${event.cacheKey ?? null},
            ${this.sql.json(event.metadata ?? {})},
            now()
          )
        `;
        return;
      } catch (error) {
        this.warnDatabaseError("usage write", error);
      }
    }

    if (!shouldUseMemoryFallback()) {
      return;
    }

    const events = memoryUsageEvents.get(normalizedEmail) ?? [];
    events.push({
      ...event,
      email: normalizedEmail,
      units: nextUnits,
      createdAt: new Date().toISOString(),
    });
    memoryUsageEvents.set(normalizedEmail, events);
  }

  async getExplainUsageSummary(email: string, startsAt: string): Promise<ExplainUsageSummary> {
    const normalizedEmail = normalizeEmail(email);

    if (this.sql) {
      try {
        await this.ensureLlmUsageTable();
        const rows = await this.sql<Array<{
          input_tokens: string | number | null;
          output_tokens: string | number | null;
          total_tokens: string | number | null;
        }>>`
          select
            coalesce(sum(input_tokens), 0) as input_tokens,
            coalesce(sum(output_tokens), 0) as output_tokens,
            coalesce(sum(total_tokens), 0) as total_tokens
          from linea_llm_usage_events
          where lower(email) = lower(${normalizedEmail})
            and created_at >= ${startsAt}
        `;

        const row = rows[0];
        return {
          inputTokens: toNumber(row?.input_tokens),
          outputTokens: toNumber(row?.output_tokens),
          totalTokens: toNumber(row?.total_tokens),
        };
      } catch (error) {
        this.warnDatabaseError("llm usage summary", error);
      }
    }

    if (!shouldUseMemoryFallback()) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }

    const windowStart = new Date(startsAt).getTime();
    const events = memoryExplainUsageEvents.get(normalizedEmail) ?? [];

    return events.reduce<ExplainUsageSummary>(
      (summary, event) => {
        if (new Date(event.createdAt).getTime() < windowStart) {
          return summary;
        }

        return {
          inputTokens: summary.inputTokens + event.inputTokens,
          outputTokens: summary.outputTokens + event.outputTokens,
          totalTokens: summary.totalTokens + event.inputTokens + event.outputTokens,
        };
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    );
  }

  async recordExplainUsage(event: ExplainUsageEvent) {
    const normalizedEmail = normalizeEmail(event.email);
    const inputTokens = Math.max(0, Math.round(event.inputTokens));
    const outputTokens = Math.max(0, Math.round(event.outputTokens));
    const totalTokens = inputTokens + outputTokens;

    if (totalTokens === 0) {
      return;
    }

    if (this.sql) {
      try {
        await this.ensureLlmUsageTable();
        await this.sql`
          insert into linea_llm_usage_events (
            id,
            email,
            clerk_user_id,
            provider,
            model,
            input_tokens,
            output_tokens,
            total_tokens,
            metadata,
            created_at
          ) values (
            ${crypto.randomUUID()},
            ${normalizedEmail},
            ${event.clerkUserId},
            ${event.provider},
            ${event.model},
            ${inputTokens},
            ${outputTokens},
            ${totalTokens},
            ${this.sql.json(event.metadata ?? {})},
            now()
          )
        `;
        return;
      } catch (error) {
        this.warnDatabaseError("llm usage write", error);
      }
    }

    if (!shouldUseMemoryFallback()) {
      return;
    }

    const events = memoryExplainUsageEvents.get(normalizedEmail) ?? [];
    events.push({
      ...event,
      email: normalizedEmail,
      inputTokens,
      outputTokens,
      createdAt: new Date().toISOString(),
    });
    memoryExplainUsageEvents.set(normalizedEmail, events);
  }

  private async ensureLlmUsageTable() {
    if (!this.sql || this.llmUsageTableEnsured) {
      return;
    }

    if (!this.llmUsageTablePromise) {
      this.llmUsageTablePromise = (async () => {
        await this.sql!`
          create table if not exists linea_llm_usage_events (
            id text primary key,
            email text not null,
            clerk_user_id text,
            provider text not null,
            model text not null,
            input_tokens integer not null,
            output_tokens integer not null,
            total_tokens integer not null,
            metadata jsonb not null default '{}'::jsonb,
            created_at timestamptz not null default now()
          )
        `;
        await this.sql!`
          create index if not exists linea_llm_usage_events_email_created_at_idx
          on linea_llm_usage_events (email, created_at desc)
        `;
        this.llmUsageTableEnsured = true;
      })();
    }

    await this.llmUsageTablePromise;
  }

  private warnDatabaseError(action: string, error: unknown) {
    if (this.warnedDatabaseError) {
      return;
    }

    this.warnedDatabaseError = true;
    console.warn("[linea:access] database-fallback", {
      action,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
