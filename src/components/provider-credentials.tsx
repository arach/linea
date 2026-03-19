import { LoaderCircle, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deleteVoxCredential,
  fetchVoxCredentials,
  saveVoxCredential,
  type VoxCredentialStatus,
  type VoxProviderId,
} from "@/lib/vox";

const providerMeta: Record<
  VoxProviderId,
  {
    label: string;
    placeholder: string;
  }
> = {
  openai: {
    label: "OpenAI",
    placeholder: "sk-...",
  },
  elevenlabs: {
    label: "ElevenLabs",
    placeholder: "Paste your ElevenLabs key",
  },
};

const providerOrder = Object.keys(providerMeta) as VoxProviderId[];

const sourceLabels = {
  environment: "Environment variable",
  keychain: "OS secure storage",
  "settings-file": "Legacy settings file",
} as const;

function toStatusMap(credentials: VoxCredentialStatus[]) {
  return credentials.reduce(
    (map, credential) => ({
      ...map,
      [credential.provider]: credential,
    }),
    {} as Partial<Record<VoxProviderId, VoxCredentialStatus>>,
  );
}

function describeCredential(credential: VoxCredentialStatus | undefined) {
  if (!credential?.configured) {
    return "No key saved yet.";
  }

  if (credential.source === "environment") {
    return "Loaded from an environment variable. Remove it from your shell to change it here.";
  }

  if (credential.source === "settings-file") {
    return "Loaded from a legacy settings file. Saving here moves future reads to the OS keychain.";
  }

  const suffix = credential.lastFour ? ` ending in ${credential.lastFour}` : "";

  return `Saved in ${sourceLabels[credential.source ?? "keychain"]}${suffix}.`;
}

export function ProviderCredentials({
  onCredentialsChanged,
}: {
  onCredentialsChanged?: () => void;
}) {
  const [credentials, setCredentials] = useState<Partial<Record<VoxProviderId, VoxCredentialStatus>>>(
    {},
  );
  const [drafts, setDrafts] = useState<Record<VoxProviderId, string>>({
    openai: "",
    elevenlabs: "",
  });
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<VoxProviderId | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadCredentials();
  }, []);

  const loadCredentials = async () => {
    setLoading(true);
    setError("");

    try {
      const nextCredentials = await fetchVoxCredentials();
      setCredentials(toStatusMap(nextCredentials));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not load provider credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (provider: VoxProviderId) => {
    const apiKey = drafts[provider].trim();

    if (!apiKey) {
      setError(`Enter a ${providerMeta[provider].label} API key first.`);
      return;
    }

    setBusyProvider(provider);
    setError("");
    setMessage("");

    try {
      const credential = await saveVoxCredential(provider, apiKey);
      setCredentials((current) => ({
        ...current,
        [provider]: credential,
      }));
      setDrafts((current) => ({
        ...current,
        [provider]: "",
      }));
      setMessage(`${providerMeta[provider].label} key saved to OS secure storage.`);
      onCredentialsChanged?.();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save the API key.");
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDelete = async (provider: VoxProviderId) => {
    setBusyProvider(provider);
    setError("");
    setMessage("");

    try {
      const credential = await deleteVoxCredential(provider);
      setCredentials((current) => ({
        ...current,
        [provider]: credential,
      }));
      setMessage(`${providerMeta[provider].label} key removed from OS secure storage.`);
      onCredentialsChanged?.();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not remove the API key.");
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <Card className="overflow-hidden bg-white/4">
      <CardHeader className="gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <Shield className="size-4 text-primary" />
          Provider access
        </div>
        <CardTitle className="text-lg">API keys</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <p className="text-sm leading-7 text-muted-foreground">
          Keys are stored in the operating system credential store instead of a plain text config
          file.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 rounded-[18px] border border-border/50 bg-black/20 px-4 py-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            Checking saved credentials
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[18px] border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-[18px] border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}

        <div className="space-y-4">
          {providerOrder.map((provider) => {
            const credential = credentials[provider];
            const isBusy = busyProvider === provider;
            const isManagedByEnvironment = credential?.source === "environment";
            const canRemove = credential?.source === "keychain";

            return (
              <div
                key={provider}
                className="space-y-3 rounded-[22px] border border-border/50 bg-black/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{providerMeta[provider].label}</div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {describeCredential(credential)}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {credential?.configured ? (
                      <ShieldCheck className="size-3.5 text-primary" />
                    ) : (
                      <Shield className="size-3.5" />
                    )}
                    {credential?.configured
                      ? sourceLabels[credential.source ?? "keychain"]
                      : "Not configured"}
                  </div>
                </div>

                <label className="space-y-2 text-sm">
                  <span className="block uppercase tracking-[0.2em] text-muted-foreground">
                    New key
                  </span>
                  <input
                    type="password"
                    value={drafts[provider]}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [provider]: event.target.value,
                      }))
                    }
                    placeholder={providerMeta[provider].placeholder}
                    className="h-11 w-full rounded-2xl border border-border/70 bg-white/6 px-4 outline-none transition focus:border-primary/50"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isManagedByEnvironment || isBusy}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void handleSave(provider)}
                    disabled={isManagedByEnvironment || isBusy}
                  >
                    {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    Save key
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleDelete(provider)}
                    disabled={!canRemove || isBusy}
                  >
                    <Trash2 className="size-4" />
                    Remove saved key
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
