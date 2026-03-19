import { ChevronDown, ChevronUp, ExternalLink, LoaderCircle, Shield, ShieldCheck, Trash2 } from "lucide-react";
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

const providerHelp = {
  openai: {
    keyUrl: "https://platform.openai.com/api-keys",
    docsUrl: "https://platform.openai.com/docs/overview",
    docsLabel: "OpenAI docs",
  },
  elevenlabs: {
    keyUrl: "https://elevenlabs.io/app/developers/api-keys",
    docsUrl: "https://elevenlabs.io/docs/api-reference/introduction",
    docsLabel: "ElevenLabs docs",
    permissions:
      "If you create a restricted key, allow Text-to-Speech generation plus access to voices and subscription/account metadata.",
  },
} as const;

const featuredProviders = [
  {
    id: "openai",
    label: "OpenAI",
    supported: true,
    blurb: "Fast setup for built-in speech.",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    supported: true,
    blurb: "Best when you want higher quality voices.",
  },
  {
    id: "groq",
    label: "Groq",
    supported: false,
    blurb: "Low-latency inference provider.",
    keyUrl: "https://console.groq.com/keys",
    docsUrl: "https://console.groq.com/docs",
  },
] as const;

const additionalProviders = [
  {
    id: "anthropic",
    label: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "google-ai-studio",
    label: "Google AI Studio",
    keyUrl: "https://aistudio.google.com/app/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyUrl: "https://openrouter.ai/settings/keys",
    docsUrl: "https://openrouter.ai/docs/quickstart",
  },
] as const;

const sourceLabels = {
  environment: "Environment variable",
  keychain: "OS secure storage",
  "settings-file": "Legacy settings file",
} as const;

const sourceShortLabels = {
  environment: "Env var",
  keychain: "Saved",
  "settings-file": "Imported",
} as const;

const supportedProviders = featuredProviders.filter((provider) => provider.supported);

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
  variant = "card",
}: {
  onCredentialsChanged?: () => void;
  variant?: "card" | "plain";
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
  const [showMoreProviders, setShowMoreProviders] = useState(false);
  const [activeProvider, setActiveProvider] = useState<VoxProviderId>("openai");

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

  const content = (
    <>
      {variant === "card" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          Keys are stored in the operating system credential store instead of a plain text config
          file.
        </p>
      ) : null}

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

      <div className="provider-picker">
        <div className="provider-picker-header">
          <div>
            <div className="provider-picker-eyebrow">Featured providers</div>
            <p className="provider-picker-copy">Pick a provider, then add or replace its API key below.</p>
          </div>
        </div>
        <div className="provider-featured-grid">
          {featuredProviders.map((provider) => {
            if (!provider.supported) {
              return (
                <div key={provider.id} className="provider-tile provider-tile-muted">
                  <div className="provider-tile-top">
                    <div>
                      <div className="provider-tile-title">{provider.label}</div>
                      <p className="provider-tile-copy">{provider.blurb}</p>
                    </div>
                    <span className="provider-status-pill">Soon</span>
                  </div>
                  <div className="provider-tile-actions">
                    <Button asChild variant="outline" size="sm">
                      <a href={provider.keyUrl} target="_blank" rel="noreferrer">
                        Key console
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <a href={provider.docsUrl} target="_blank" rel="noreferrer">
                        Docs
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              );
            }

            const credential = credentials[provider.id];
            const configured = Boolean(credential?.configured);
            const statusLabel = configured
              ? sourceShortLabels[credential?.source ?? "keychain"]
              : "Add key";

            return (
              <button
                key={provider.id}
                type="button"
                className={`provider-tile${activeProvider === provider.id ? " active" : ""}`}
                onClick={() => setActiveProvider(provider.id)}
              >
                <div className="provider-tile-top">
                  <div>
                    <div className="provider-tile-title">{provider.label}</div>
                    <p className="provider-tile-copy">{provider.blurb}</p>
                  </div>
                  <span className="provider-status-pill">
                    {configured ? <ShieldCheck className="size-3.5 text-primary" /> : <Shield className="size-3.5" />}
                    {statusLabel}
                  </span>
                </div>
                <p className="provider-tile-detail">{describeCredential(credential)}</p>
              </button>
            );
          })}
        </div>
      </div>

      {supportedProviders
        .filter((provider) => provider.id === activeProvider)
        .map((provider) => {
          const credential = credentials[provider.id];
          const isBusy = busyProvider === provider.id;
          const isManagedByEnvironment = credential?.source === "environment";
          const canRemove = credential?.source === "keychain";
          const isConfigured = Boolean(credential?.configured);

          return (
            <section key={provider.id} className="provider-editor">
              <div className="provider-editor-header">
                <div>
                  <div className="provider-picker-eyebrow">Selected provider</div>
                  <h3 className="provider-editor-title">{provider.label}</h3>
                  <p className="provider-editor-copy">{describeCredential(credential)}</p>
                </div>
                <div className="provider-editor-links">
                  <Button asChild variant="outline" size="sm">
                    <a href={providerHelp[provider.id].keyUrl} target="_blank" rel="noreferrer">
                      Open key console
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <a href={providerHelp[provider.id].docsUrl} target="_blank" rel="noreferrer">
                      {providerHelp[provider.id].docsLabel}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                </div>
              </div>

              {provider.id === "elevenlabs" ? (
                <p className="provider-editor-note">
                  {providerHelp.elevenlabs.permissions}
                </p>
              ) : null}

              {isManagedByEnvironment ? (
                <p className="provider-editor-note">
                  This key is managed by an environment variable. Remove it from your shell or deployment
                  environment if you want to override it here.
                </p>
              ) : (
                <div className="provider-editor-form">
                  <label className="space-y-2 text-sm">
                    <span className="block uppercase tracking-[0.2em] text-muted-foreground">
                      {isConfigured ? "Replace key" : "Add key"}
                    </span>
                    <input
                      type="password"
                      value={drafts[provider.id]}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [provider.id]: event.target.value,
                        }))
                      }
                      placeholder={providerMeta[provider.id].placeholder}
                      className="h-11 w-full rounded-2xl border border-border/70 bg-white/6 px-4 outline-none transition focus:border-primary/50"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={isBusy}
                    />
                  </label>

                  <div className="provider-editor-actions">
                    <Button onClick={() => void handleSave(provider.id)} disabled={isBusy}>
                      {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                      {isConfigured ? "Update key" : "Save key"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleDelete(provider.id)}
                      disabled={!canRemove || isBusy}
                    >
                      <Trash2 className="size-4" />
                      Remove saved key
                    </Button>
                  </div>
                </div>
              )}
            </section>
          );
        })}

      <div className="space-y-3 rounded-[20px] border border-border/40 bg-black/10 p-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-2xl px-2 py-1 text-left text-sm font-medium text-foreground transition hover:bg-white/6"
          onClick={() => setShowMoreProviders((current) => !current)}
        >
          <span>More providers</span>
          {showMoreProviders ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {showMoreProviders ? (
          <div className="provider-more-grid">
            {additionalProviders.map((provider) => (
              <div key={provider.id} className="provider-more-card">
                <div className="text-sm font-semibold">{provider.label}</div>
                <p className="mt-1 text-sm text-muted-foreground">Provider support is coming soon.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={provider.keyUrl} target="_blank" rel="noreferrer">
                      API key
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <a href={provider.docsUrl} target="_blank" rel="noreferrer">
                      Docs
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  if (variant === "plain") {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <Card className="overflow-hidden bg-white/4">
      <CardHeader className="gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <Shield className="size-4 text-primary" />
          Provider access
        </div>
        <CardTitle className="text-lg">API keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">{content}</CardContent>
    </Card>
  );
}
