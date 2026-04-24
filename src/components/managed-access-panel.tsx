import { LoaderCircle, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

import { ClerkAccessControls } from "@/components/clerk-access-controls";
import { ProviderCredentials } from "@/components/provider-credentials";
import type { LineaManagedAccessSnapshot } from "@/lib/linea-access";
import type { VoxCompanionRuntime } from "@/lib/vox-companion";

function getAuthProviderLabel(snapshot: LineaManagedAccessSnapshot) {
  if (snapshot.authProvider === "x") {
    return "X";
  }

  return "Clerk";
}

function formatLimit(value: number | null, unit: "chars" | "seconds") {
  if (value == null) {
    return "Unlimited";
  }

  if (unit === "chars") {
    return `${value.toLocaleString()} chars`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatUsed(value: number, unit: "chars" | "seconds") {
  if (unit === "chars") {
    return `${value.toLocaleString()} used`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s used`;
}

function AccessNotice({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[18px] border border-border/50 bg-black/20 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-primary">{icon}</div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-sm leading-7 text-muted-foreground">{body}</div>
        </div>
      </div>
    </div>
  );
}

export function ManagedAccessPanel({
  snapshot,
  loading,
  error,
  onCredentialsChanged,
  localRuntime,
}: {
  snapshot: LineaManagedAccessSnapshot;
  loading: boolean;
  error: string;
  onCredentialsChanged?: () => void;
  localRuntime?: VoxCompanionRuntime | null;
}) {
  if (!snapshot.enabled) {
    return (
      <>
        {error ? (
          <div className="rounded-[18px] border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        <ProviderCredentials
          variant="plain"
          localRuntime={localRuntime ?? null}
          onCredentialsChanged={onCredentialsChanged}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 rounded-[18px] border border-border/50 bg-black/20 px-4 py-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          Checking shared access
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[18px] border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {snapshot.access.status === "active" ? (
        <AccessNotice
          icon={<ShieldCheck className="size-4" />}
          title="Managed voice is active"
          body={
            snapshot.user?.email
              ? `Shared voice is enabled for ${snapshot.user.email}. Provider keys stay on the server.`
              : "Shared voice is enabled for this signed-in account."
          }
        />
      ) : snapshot.access.status === "signed-out" ? (
        <AccessNotice
          icon={<Shield className="size-4" />}
          title="Sign in for shared voice"
          body={`Use ${getAuthProviderLabel(snapshot)} sign-in to unlock the managed provider keys attached to this deployment.`}
        />
      ) : (
        <AccessNotice
          icon={<ShieldAlert className="size-4" />}
          title="Shared access not granted"
          body={snapshot.access.reason}
        />
      )}

      {!snapshot.managedKeysConfigured ? (
        <AccessNotice
          icon={<ShieldAlert className="size-4" />}
          title="Deployment keys still need setup"
          body="Set the managed OpenAI and/or ElevenLabs keys on the server before shared voice can actually synthesize audio."
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[18px] border border-border/50 bg-black/20 px-4 py-3">
          <div className="linea-panel-label">TTS quota</div>
          <div className="mt-2 text-lg font-medium text-foreground">
            {formatLimit(snapshot.access.quotas.ttsChars.limit, "chars")}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {formatUsed(snapshot.access.quotas.ttsChars.used, "chars")}
          </div>
        </div>
        <div className="rounded-[18px] border border-border/50 bg-black/20 px-4 py-3">
          <div className="linea-panel-label">Transcription quota</div>
          <div className="mt-2 text-lg font-medium text-foreground">
            {formatLimit(snapshot.access.quotas.transcriptionSeconds.limit, "seconds")}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {formatUsed(snapshot.access.quotas.transcriptionSeconds.used, "seconds")}
          </div>
        </div>
      </div>

      <div className="rounded-[18px] border border-border/50 bg-black/20 px-4 py-3">
        <div className="linea-panel-label">Window</div>
        <div className="mt-2 text-sm text-muted-foreground">
          {snapshot.access.quotas.window.label}
          {` · `}
          Metering mode: {snapshot.access.meteringMode}
        </div>
      </div>

      {snapshot.localCredentialsEnabled ? (
        <ProviderCredentials
          variant="plain"
          localRuntime={localRuntime ?? null}
          onCredentialsChanged={onCredentialsChanged}
        />
      ) : (
        <div className="rounded-[18px] border border-border/50 bg-black/20 px-4 py-3 text-sm leading-7 text-muted-foreground">
          Local API-key entry is hidden while managed access is enabled. Use a signed-in allowlisted
          account instead.
        </div>
      )}

      <div className="flex justify-end">
        <ClerkAccessControls snapshot={snapshot} />
      </div>
    </div>
  );
}
