import { OraPlaybackTracker, type OraPlaybackSegment } from "@arach/ora";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ReaderPage, ReaderParagraph } from "@/lib/pdf";
import {
  alignWithVoxCompanion,
  discoverVoxCompanion,
  type VoxCompanionRuntime,
} from "@/lib/vox-companion";
import {
  alignLineaVoice,
  fetchLineaVoiceCapabilities,
  fetchLineaVoiceProviders,
  fetchLineaVoiceVoices,
  synthesizeLineaVoice,
  type LineaVoiceCapabilities,
  type LineaVoiceProviderId,
  type LineaVoiceProviderStatus,
  type LineaVoice,
} from "@/lib/linea-voice";
import { recordDevInspectorEntry } from "@/lib/dev-inspector";
import { clamp } from "@/lib/utils";

type VoiceConsoleOptions = {
  pages: ReaderPage[];
  selectedPage: number;
  onSelectPage: (pageNumber: number) => void;
};

type SpeechSession = {
  pageNumber: number;
  text: string;
  label: string;
  paragraphId: string | null;
  charOffsetBase: number;
  kind: "page" | "paragraph" | "selection";
  segments: OraPlaybackSegment[];
};

type VoiceActivityPhase =
  | "idle"
  | "requesting"
  | "ready"
  | "playing"
  | "paused"
  | "stopped"
  | "ended"
  | "error";

type VoiceRequestStage = "requesting" | "processing" | "downloading";

type VoiceActivity = {
  phase: VoiceActivityPhase;
  requestStage?: VoiceRequestStage | null;
  label: string;
  detail: string;
  scopeLabel: string | null;
  wordCount: number | null;
  provider: LineaVoiceProviderId | null;
  voice: string | null;
  cacheKey: string | null;
  audioUrl: string | null;
  cached: boolean | null;
  pageNumber: number | null;
  paragraphId: string | null;
};

type VoicePlaybackWindow = {
  elapsedMs: number;
  durationMs: number;
  progress: number;
  currentWord: number;
  totalWords: number;
};

type PlaybackParagraphState = "completed" | "current" | "upcoming";

/**
 * Build playback text and segments, filtering out skipped paragraphs.
 * Returns { text, segments, firstParagraphId } for session construction.
 */
function buildPlaybackContent(page: ReaderPage, startOffset = 0) {
  const eligible = page.paragraphs.filter(
    (p) => p.end > startOffset && !p.skip,
  );

  let cursor = 0;
  const segments: OraPlaybackSegment[] = [];
  const textParts: string[] = [];

  for (const p of eligible) {
    const sliceStart = Math.max(p.start, startOffset);
    const chunk = page.text.slice(sliceStart, p.end);
    const start = cursor;
    const end = cursor + chunk.length;
    segments.push({ id: p.id, start, end, label: p.id });
    textParts.push(chunk);
    cursor = end + 2; // account for \n\n join
  }

  return {
    text: textParts.join("\n\n"),
    segments: segments.filter((s) => s.end > s.start),
    firstParagraphId: eligible[0]?.id ?? null,
  };
}

function createSessionSegments(page: ReaderPage, startOffset = 0): OraPlaybackSegment[] {
  return buildPlaybackContent(page, startOffset).segments;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function shouldAutoDiscoverVoxCompanion() {
  if (!isBrowser()) {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function createInlineAudioUrl(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function getRecognitionConstructor() {
  if (!isBrowser()) {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function debugVoice(event: string, detail?: Record<string, unknown>) {
  if (!isBrowser()) {
    return;
  }

  recordDevInspectorEntry({
    source: "ora",
    action: event,
    status: "info",
    detail,
  });

  if (detail) {
    console.info(`[linea:voice] ${event}`, detail);
    return;
  }

  console.info(`[linea:voice] ${event}`);
}

function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

export function useVoiceConsole({
  pages,
  selectedPage,
  onSelectPage,
}: VoiceConsoleOptions) {
  const [providers, setProviders] = useState<LineaVoiceProviderStatus[]>([]);
  const [capabilities, setCapabilities] = useState<LineaVoiceCapabilities>({ alignment: false });
  const [localRuntime, setLocalRuntime] = useState<VoxCompanionRuntime | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<LineaVoiceProviderId>("openai");
  const [voicesByProvider, setVoicesByProvider] = useState<Partial<Record<LineaVoiceProviderId, LineaVoice[]>>>({});
  const [selectedVoice, setSelectedVoice] = useState("");
  const [rate, setRate] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const [spokenCharacterIndex, setSpokenCharacterIndex] = useState(0);
  const [speechSession, setSpeechSession] = useState<SpeechSession | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [activity, setActivity] = useState<VoiceActivity>({
    phase: "idle",
    label: "Idle",
    detail: "Choose a page or paragraph to request audio.",
    scopeLabel: null,
    wordCount: null,
    provider: null,
    voice: null,
    cacheKey: null,
    audioUrl: null,
    cached: null,
    pageNumber: null,
    paragraphId: null,
  });
  const [playbackWindow, setPlaybackWindow] = useState<VoicePlaybackWindow>({
    elapsedMs: 0,
    durationMs: 0,
    progress: 0,
    currentWord: 0,
    totalWords: 0,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const trackerRef = useRef<OraPlaybackTracker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const inlineAudioUrlRef = useRef<string | null>(null);

  const recognitionSupported = Boolean(getRecognitionConstructor());
  const selectedPageData = useMemo(
    () => pages.find((page) => page.pageNumber === selectedPage) ?? null,
    [pages, selectedPage],
  );
  const voices = voicesByProvider[selectedProvider] ?? [];
  const selectedProviderMeta =
    providers.find((provider) => provider.id === selectedProvider) ?? null;
  const selectedVoiceMeta =
    voices.find((voice) => voice.id === selectedVoice) ?? voices[0] ?? null;
  const activeParagraph = useMemo(() => {
    const pageForSession =
      pages.find((page) => page.pageNumber === (speechSession?.pageNumber ?? selectedPage)) ??
      selectedPageData;

    if (!pageForSession?.paragraphs.length) {
      return null;
    }

    return (
      pageForSession.paragraphs.find(
        (paragraph) =>
          spokenCharacterIndex + (speechSession?.charOffsetBase ?? 0) >= paragraph.start &&
          spokenCharacterIndex + (speechSession?.charOffsetBase ?? 0) < paragraph.end + 2,
      ) ?? pageForSession.paragraphs[0] ?? null
    );
  }, [pages, selectedPage, selectedPageData, speechSession, spokenCharacterIndex]);
  const playbackRange = useMemo(() => {
    const empty = {
      pageNumber: null,
      startParagraphId: null,
      endParagraphId: null,
      stateByParagraphId: {} as Record<string, PlaybackParagraphState>,
    };

    if (!speechSession) {
      return empty;
    }

    const segments = speechSession.segments.filter(
      (segment): segment is OraPlaybackSegment & { id: string } => Boolean(segment.id),
    );

    if (
      segments.length === 0 ||
      !["requesting", "playing", "paused"].includes(activity.phase)
    ) {
      return empty;
    }

    const stateByParagraphId: Record<string, PlaybackParagraphState> = {};

    for (const segment of segments) {
      if (activity.phase === "requesting") {
        stateByParagraphId[segment.id] = "upcoming";
        continue;
      }

      if (spokenCharacterIndex >= segment.end) {
        stateByParagraphId[segment.id] = "completed";
        continue;
      }

      if (spokenCharacterIndex >= segment.start && spokenCharacterIndex < segment.end) {
        stateByParagraphId[segment.id] = "current";
        continue;
      }

      stateByParagraphId[segment.id] = "upcoming";
    }

    if (
      (activity.phase === "playing" || activity.phase === "paused") &&
      !Object.values(stateByParagraphId).includes("current")
    ) {
      const fallbackSegment =
        segments.find((segment) => stateByParagraphId[segment.id] !== "completed") ??
        segments[segments.length - 1];

      if (fallbackSegment) {
        stateByParagraphId[fallbackSegment.id] = "current";
      }
    }

    return {
      pageNumber: speechSession.pageNumber,
      startParagraphId: segments[0]?.id ?? null,
      endParagraphId: segments[segments.length - 1]?.id ?? null,
      stateByParagraphId,
    };
  }, [activity.phase, speechSession, spokenCharacterIndex]);

  const refreshProviders = async () => {
    const nextProviders = await fetchLineaVoiceProviders();
    setProviders(nextProviders);

    const preferred =
      nextProviders.find((provider) => provider.id === selectedProvider && provider.available) ??
      nextProviders.find((provider) => provider.available) ??
      nextProviders[0] ??
      null;

    if (preferred) {
      setSelectedProvider(preferred.id);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [nextProviders, nextCapabilities] = await Promise.all([
          fetchLineaVoiceProviders(),
          fetchLineaVoiceCapabilities().catch(() => ({ alignment: false })),
        ]);
        debugVoice("providers-loaded", {
          providers: nextProviders.map((provider) => ({
            id: provider.id,
            available: provider.available,
            defaultVoice: provider.defaultVoice,
          })),
          capabilities: nextCapabilities,
        });
        if (cancelled) return;
        setProviders(nextProviders);
        setCapabilities(nextCapabilities);

        const preferred =
          nextProviders.find((provider) => provider.id === selectedProvider && provider.available) ??
          nextProviders.find((provider) => provider.available) ??
          nextProviders[0] ??
          null;

        if (preferred) {
          setSelectedProvider(preferred.id);
        }
      } catch (error) {
        debugVoice("providers-load-failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
        if (!cancelled) {
          setVoiceError(error instanceof Error ? error.message : "Could not load voice providers.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProvider) return;
    if (voicesByProvider[selectedProvider]) return;

    let cancelled = false;
    setLoadingVoices(true);
    setVoiceError("");

    void (async () => {
      try {
        const nextVoices = await fetchLineaVoiceVoices(selectedProvider);
        debugVoice("voices-loaded", {
          provider: selectedProvider,
          count: nextVoices.length,
          voices: nextVoices.slice(0, 8).map((voice) => voice.id),
        });
        if (cancelled) return;

        setVoicesByProvider((current) => ({
          ...current,
          [selectedProvider]: nextVoices,
        }));

        if (!selectedVoice && nextVoices[0]) {
          setSelectedVoice(nextVoices[0].id);
        }
      } catch (error) {
        debugVoice("voices-load-failed", {
          provider: selectedProvider,
          error: error instanceof Error ? error.message : "unknown",
        });
        if (!cancelled) {
          setVoiceError(error instanceof Error ? error.message : "Could not load provider voices.");
        }
      } finally {
        if (!cancelled) {
          setLoadingVoices(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProvider, selectedVoice, voicesByProvider]);

  useEffect(() => {
    const currentVoices = voicesByProvider[selectedProvider] ?? [];

    if (currentVoices.some((voice) => voice.id === selectedVoice)) {
      return;
    }

    const fallbackVoice = currentVoices[0]?.id ?? selectedProviderMeta?.defaultVoice ?? "";
    if (fallbackVoice) {
      setSelectedVoice(fallbackVoice);
    }
  }, [selectedProvider, selectedProviderMeta?.defaultVoice, selectedVoice, voicesByProvider]);

  useEffect(() => {
    return () => {
      requestAbortRef.current?.abort();
      recognitionRef.current?.stop();
      audioRef.current?.pause();
      audioRef.current = null;
      if (inlineAudioUrlRef.current) {
        URL.revokeObjectURL(inlineAudioUrlRef.current);
        inlineAudioUrlRef.current = null;
      }
    };
  }, []);

  const revokeInlineAudioUrl = () => {
    if (!inlineAudioUrlRef.current) {
      return;
    }

    URL.revokeObjectURL(inlineAudioUrlRef.current);
    inlineAudioUrlRef.current = null;
  };

  const resetPlayback = () => {
    trackerRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
    setSpokenCharacterIndex(0);
    setSpeechSession(null);
    setPlaybackWindow((current) => ({
      ...current,
      elapsedMs: 0,
      durationMs: current.durationMs,
      progress: 0,
      currentWord: 0,
    }));
  };

  const stopSpeaking = () => {
    debugVoice("stop-speaking");
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    resetPlayback();
    setActivity((current) => ({
      ...current,
      phase: "stopped",
      label: "Stopped",
      detail:
        current.phase === "requesting" ? "Synthesis request canceled." : "Playback stopped.",
    }));
  };

  const speakSession = async (session: SpeechSession) => {
    if (!session.text.trim()) {
      return;
    }

    if (!selectedProviderMeta?.available) {
      const fallbackProvider =
        providers.find((provider) => provider.available) ?? null;

      if (fallbackProvider && fallbackProvider.id !== selectedProvider) {
        debugVoice("switching-to-available-provider", {
          from: selectedProvider,
          to: fallbackProvider.id,
        });
        setSelectedProvider(fallbackProvider.id);
        setVoiceError(`Switched to ${fallbackProvider.label} because ${selectedProviderMeta?.label ?? "the selected provider"} is unavailable.`);
        setActivity({
          phase: "error",
          label: "Provider unavailable",
          detail: `Switched to ${fallbackProvider.label}. Retry the request to synthesize there.`,
          scopeLabel: null,
          wordCount: null,
          provider: selectedProvider,
          voice: null,
          cacheKey: null,
          audioUrl: null,
          cached: null,
          pageNumber: session.pageNumber,
          paragraphId: session.paragraphId,
        });
        return;
      }

      debugVoice("speak-blocked-provider-unavailable", {
        provider: selectedProvider,
        label: selectedProviderMeta?.label ?? "unknown",
      });
      setVoiceError(`${selectedProviderMeta?.label ?? "Selected provider"} is not configured yet.`);
      setActivity({
        phase: "error",
        label: "Provider unavailable",
        detail: `${selectedProviderMeta?.label ?? "Selected provider"} is not configured yet.`,
        scopeLabel: null,
        wordCount: null,
        provider: selectedProvider,
        voice: null,
        cacheKey: null,
        audioUrl: null,
        cached: null,
        pageNumber: session.pageNumber,
        paragraphId: session.paragraphId,
      });
      return;
    }

    const voiceId = selectedVoice || selectedProviderMeta.defaultVoice;
    if (!voiceId) {
      debugVoice("speak-blocked-no-voice", {
        provider: selectedProvider,
      });
      setVoiceError("No voice is available for the selected provider.");
      setActivity({
        phase: "error",
        label: "No voice selected",
        detail: "Pick a voice before requesting audio.",
        scopeLabel: null,
        wordCount: null,
        provider: selectedProvider,
        voice: null,
        cacheKey: null,
        audioUrl: null,
        cached: null,
        pageNumber: session.pageNumber,
        paragraphId: session.paragraphId,
      });
      return;
    }

    stopSpeaking();
    revokeInlineAudioUrl();
    setSpeechSession(session);
    setSpokenCharacterIndex(0);
    setVoiceError("");
    const nextWordCount = countWords(session.text);
    const scopeLabel =
      session.kind === "page"
        ? `Page ${session.pageNumber}`
        : session.kind === "paragraph"
          ? session.paragraphId?.replace("page-", "p") ?? "Paragraph"
          : session.paragraphId?.replace("page-", "p") ?? "Selection";
    setActivity({
      phase: "requesting",
      requestStage: "requesting",
      label: "Requesting audio",
      detail: `Sending ${scopeLabel.toLowerCase()} for speech with ${nextWordCount.toLocaleString()} words.`,
      scopeLabel,
      wordCount: nextWordCount,
      provider: selectedProvider,
      voice: voiceId,
      cacheKey: null,
      audioUrl: null,
      cached: null,
      pageNumber: session.pageNumber,
      paragraphId: session.paragraphId,
    });
    debugVoice("speak-requested", {
      provider: selectedProvider,
      voice: voiceId,
      pageNumber: session.pageNumber,
      kind: session.kind,
      textLength: session.text.length,
      rate,
    });

    try {
      const runtime = shouldAutoDiscoverVoxCompanion()
        ? await discoverVoxCompanion()
        : null;
      setLocalRuntime(runtime);
      setActivity((current) => ({
        ...current,
        phase: "requesting",
        requestStage: "processing",
        label: "Generating audio",
        detail: `Preparing ${scopeLabel.toLowerCase()} with ${selectedProviderMeta.label}.`,
      }));

      const abortController = new AbortController();
      requestAbortRef.current = abortController;
      const response = await synthesizeLineaVoice({
        provider: selectedProvider,
        text: session.text,
        voice: voiceId,
        rate,
        format: "mp3",
        source: {
          pageNumber: session.pageNumber,
          paragraphId: session.paragraphId,
        },
      }, {
        signal: abortController.signal,
      });
      requestAbortRef.current = null;
      debugVoice("synthesize-succeeded", {
        provider: selectedProvider,
        voice: response.voice,
        cacheKey: response.cacheKey,
        cached: response.cached,
        audioUrl: response.audioUrl,
      });
      const playableAudioUrl = response.audioDataBase64
        ? createInlineAudioUrl(response.audioDataBase64, response.audioMimeType ?? "audio/mpeg")
        : response.audioUrl;

      if (response.audioDataBase64) {
        inlineAudioUrlRef.current = playableAudioUrl;
      }

      setActivity({
        phase: "requesting",
        requestStage: "downloading",
        label: response.cached ? "Loading cached audio" : "Downloading audio",
        detail: response.cached
          ? "Loading the cached clip into the player."
          : "Receiving the generated clip and preparing playback.",
        scopeLabel,
        wordCount: nextWordCount,
        provider: selectedProvider,
        voice: response.voice,
        cacheKey: response.cacheKey,
        audioUrl: playableAudioUrl,
        cached: response.cached,
        pageNumber: session.pageNumber,
        paragraphId: session.paragraphId,
      });

      const audio = new Audio(playableAudioUrl);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        const durationMs = Number.isFinite(audio.duration) ? Math.max(0, audio.duration * 1000) : 0;
        setPlaybackWindow({
          elapsedMs: 0,
          durationMs,
          progress: 0,
          currentWord: 0,
          totalWords: nextWordCount,
        });
      };

      const calibrateTracker = () => {
        if (!trackerRef.current) return;
        const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
        if (durationMs > 0) {
          trackerRef.current.calibrate(durationMs);
          debugVoice("tracker-calibrated", { durationMs });
        }
      };

      audio.onloadedmetadata = () => calibrateTracker();

      audio.onplay = () => {
        debugVoice("audio-play");
        trackerRef.current = new OraPlaybackTracker({
          text: session.text,
          segments: session.segments,
        });
        calibrateTracker();
        setIsSpeaking(true);
        setIsPaused(false);
        setSpokenCharacterIndex(0);
        setSpeechSession(session);
        setLastCommand(`${selectedProviderMeta.label}: ${session.label}`);
        onSelectPage(session.pageNumber);
        setActivity({
          phase: "playing",
          requestStage: null,
          label: `Playing ${session.kind}`,
          detail: response.cached
            ? "Playback started from cached audio."
            : "Playback started from freshly generated audio.",
          scopeLabel,
          wordCount: nextWordCount,
          provider: selectedProvider,
          voice: response.voice,
          cacheKey: response.cacheKey,
          audioUrl: playableAudioUrl,
          cached: response.cached,
          pageNumber: session.pageNumber,
          paragraphId: session.paragraphId,
        });

        if (runtime?.capabilities.features?.alignment || capabilities.alignment) {
          const audioUrl = response.audioUrl.startsWith("http")
            ? response.audioUrl
            : `${window.location.origin}${response.audioUrl}`;

          const alignPromise = runtime
            ? alignWithVoxCompanion(runtime, {
                audioUrl,
                cacheKey: response.cacheKey,
                pageNumber: session.pageNumber,
                paragraphId: session.paragraphId,
              }).catch((err) => {
                debugVoice("companion-alignment-failed", {
                  error: err instanceof Error ? err.message : "unknown",
                });
                return null;
              })
            : alignLineaVoice(response.cacheKey).catch((err) => {
                debugVoice("alignment-failed", { error: err instanceof Error ? err.message : "unknown" });
                return null;
              });

          alignPromise.then((alignment) => {
            if (!alignment || !trackerRef.current) return;
            debugVoice("alignment-applied", { wordCount: alignment.words.length, durationMs: alignment.durationMs });
            trackerRef.current.applyAlignment(alignment.words);
          });
        }
      };

      audio.onpause = () => {
        if (audio.ended) return;
        debugVoice("audio-pause");
        setIsPaused(true);
        setIsSpeaking(false);
        setActivity((current) => ({
          ...current,
          phase: "paused",
          requestStage: null,
          label: "Paused",
          detail: "Playback paused. Resume will continue the current clip.",
        }));
      };

      audio.ontimeupdate = () => {
        const snapshot = trackerRef.current?.updateFromClock(audio.currentTime * 1000);
        const nextCharIndex = snapshot?.currentCharIndex ?? 0;
        setSpokenCharacterIndex(nextCharIndex);
        const durationMs = Number.isFinite(audio.duration) ? Math.max(0, audio.duration * 1000) : 0;
        const elapsedMs = Math.max(0, audio.currentTime * 1000);
        const progress = durationMs > 0 ? Math.min(1, elapsedMs / durationMs) : 0;
        const currentWord = Math.min(
          nextWordCount,
          Math.max(0, countWords(session.text.slice(0, nextCharIndex))),
        );
        setPlaybackWindow({
          elapsedMs,
          durationMs,
          progress,
          currentWord,
          totalWords: nextWordCount,
        });
      };

      audio.onended = () => {
        debugVoice("audio-ended");
        setActivity((current) => ({
          ...current,
          phase: "ended",
          requestStage: null,
          label: "Finished",
          detail: "Playback completed.",
        }));
        setPlaybackWindow((current) => ({
          ...current,
          elapsedMs: current.durationMs,
          progress: 1,
          currentWord: current.totalWords,
        }));
        resetPlayback();
      };

      audio.onerror = () => {
        debugVoice("audio-error", {
          provider: selectedProvider,
          voice: voiceId,
          audioUrl: playableAudioUrl,
        });
        setVoiceError("Audio playback failed.");
        setActivity({
          phase: "error",
          requestStage: null,
          label: "Playback failed",
          detail: "The audio clip was generated, but the browser could not play it.",
          scopeLabel,
          wordCount: nextWordCount,
          provider: selectedProvider,
          voice: voiceId,
          cacheKey: response.cacheKey,
          audioUrl: playableAudioUrl,
          cached: response.cached,
          pageNumber: session.pageNumber,
          paragraphId: session.paragraphId,
        });
        resetPlayback();
      };

      await audio.play();
    } catch (error) {
      requestAbortRef.current = null;
      if (error instanceof DOMException && error.name === "AbortError") {
        debugVoice("synthesize-canceled", {
          provider: selectedProvider,
          voice: voiceId,
        });
        setVoiceError("");
        setActivity((current) => ({
          ...current,
          phase: "stopped",
          requestStage: null,
          label: "Canceled",
          detail: "Synthesis request canceled before audio was generated.",
        }));
        resetPlayback();
        return;
      }
      debugVoice("synthesize-failed", {
        provider: selectedProvider,
        voice: voiceId,
        error: error instanceof Error ? error.message : "unknown",
      });
      setVoiceError(error instanceof Error ? error.message : "Synthesis failed.");
      setActivity({
        phase: "error",
        requestStage: null,
        label: "Synthesis failed",
        detail: error instanceof Error ? error.message : "The provider failed to return audio.",
        scopeLabel,
        wordCount: nextWordCount,
        provider: selectedProvider,
        voice: voiceId,
        cacheKey: null,
        audioUrl: null,
        cached: null,
        pageNumber: session.pageNumber,
        paragraphId: session.paragraphId,
      });
      resetPlayback();
    }
  };

  const speakPage = (page = selectedPageData) => {
    if (!page?.text) {
      return;
    }

    debugVoice("speak-page-click", {
      pageNumber: page.pageNumber,
    });

    const playback = buildPlaybackContent(page);

    void speakSession({
      pageNumber: page.pageNumber,
      text: playback.text,
      label: `Reading page ${page.pageNumber}`,
      paragraphId: playback.firstParagraphId,
      charOffsetBase: 0,
      kind: "page",
      segments: playback.segments,
    });
  };

  const speakFromParagraph = (page: ReaderPage | null, paragraph: ReaderParagraph | null) => {
    if (!page || !paragraph) {
      return;
    }

    debugVoice("speak-paragraph-click", {
      pageNumber: page.pageNumber,
      paragraphId: paragraph.id,
    });

    const playback = buildPlaybackContent(page, paragraph.start);

    void speakSession({
      pageNumber: page.pageNumber,
      text: playback.text,
      label: `Reading from paragraph ${paragraph.id.replace("page-", "p")}`,
      paragraphId: paragraph.id,
      charOffsetBase: paragraph.start,
      kind: "paragraph",
      segments: playback.segments,
    });
  };

  const speakSelection = (
    selection: {
      text: string;
      paragraphId: string | null;
      paragraphIds: string[];
      startCharIndex: number | null;
      endCharIndex: number | null;
    },
    page: ReaderPage | null,
  ) => {
    if (!page) {
      return;
    }

    const rangeStart =
      selection.startCharIndex != null
        ? Math.max(0, Math.min(page.text.length, selection.startCharIndex))
        : null;
    const rangeEnd =
      selection.endCharIndex != null
        ? Math.max(0, Math.min(page.text.length, selection.endCharIndex))
        : null;
    const hasConcreteRange =
      rangeStart != null &&
      rangeEnd != null &&
      rangeEnd > rangeStart;

    const text = hasConcreteRange
      ? page.text.slice(rangeStart, rangeEnd).trim()
      : selection.text.trim();

    if (!text) {
      return;
    }

    debugVoice("speak-selection-click", {
      pageNumber: page.pageNumber,
      paragraphId: selection.paragraphId,
      textLength: text.length,
      paragraphCount: selection.paragraphIds.length,
    });

    const selectedParagraphs = hasConcreteRange
      ? page.paragraphs.filter(
          (paragraph) => paragraph.end > rangeStart! && paragraph.start < rangeEnd! && !paragraph.skip,
        )
      : page.paragraphs.filter((entry) => entry.id === selection.paragraphId);
    const paragraph = selectedParagraphs[0] ?? null;
    const baseOffset = hasConcreteRange
      ? rangeStart!
      : paragraph
        ? paragraph.start + Math.max(0, paragraph.text.indexOf(text))
        : 0;
    const segments = hasConcreteRange
      ? selectedParagraphs
          .map((paragraph) => ({
            id: paragraph.id,
            start: Math.max(paragraph.start, rangeStart!) - rangeStart!,
            end: Math.min(paragraph.end, rangeEnd!) - rangeStart!,
            label: paragraph.id,
          }))
          .filter((segment) => segment.end > segment.start)
      : paragraph
        ? [
            {
              id: paragraph.id,
              start: 0,
              end: text.length,
              label: paragraph.id,
            },
          ]
        : [];

    void speakSession({
      pageNumber: page.pageNumber,
      text,
      label: "Reading selection",
      paragraphId: paragraph?.id ?? selection.paragraphId,
      charOffsetBase: baseOffset,
      kind: "selection",
      segments,
    });
  };

  const pauseOrResume = () => {
    const audio = audioRef.current;

    if (!audio) {
      debugVoice("pause-or-resume-without-audio");
      if (speechSession) {
        void speakSession(speechSession);
      } else {
        speakPage();
      }
      return;
    }

    if (audio.paused) {
      debugVoice("resume-audio");
      void audio.play();
      setIsPaused(false);
      setIsSpeaking(true);
      return;
    }

    debugVoice("pause-audio");
    audio.pause();
    setIsPaused(true);
    setIsSpeaking(false);
  };

  const seekToCharIndex = (charIndex: number) => {
    const audio = audioRef.current;
    const session = speechSession;
    const tracker = trackerRef.current;

    if (!audio || !session || !tracker) {
      return;
    }

    const durationMs = Number.isFinite(audio.duration) ? Math.max(0, audio.duration * 1000) : 0;
    if (durationMs <= 0) {
      return;
    }

    // Convert absolute char index to session-relative
    const relativeIndex = clamp(charIndex - (session.charOffsetBase ?? 0), 0, session.text.length);

    // Find the corresponding time from the timeline
    const totalTimeMs = tracker.timeline[tracker.timeline.length - 1]?.endMs ?? 0;
    if (totalTimeMs <= 0) return;

    // Find the timed token at this char position
    const token = tracker.tokens.find((t) => relativeIndex >= t.start && relativeIndex < t.end)
      ?? tracker.tokens.reduce<(typeof tracker.tokens)[0] | null>((best, t) => t.start <= relativeIndex ? t : best, null);
    if (!token) return;

    const timedToken = tracker.timeline[token.index];
    if (!timedToken) return;

    const nextTimeMs = timedToken.startMs;
    const nextProgress = clamp(nextTimeMs / totalTimeMs, 0, 1);
    audio.currentTime = (durationMs * nextProgress) / 1000;

    const nextCharIndex = relativeIndex;
    const currentWord = Math.min(
      playbackWindow.totalWords,
      Math.max(0, countWords(session.text.slice(0, nextCharIndex))),
    );

    setSpokenCharacterIndex(nextCharIndex);
    setPlaybackWindow((current) => ({
      ...current,
      elapsedMs: durationMs * nextProgress,
      durationMs,
      progress: nextProgress,
      currentWord,
    }));
  };

  const seekPlayback = (progress: number) => {
    const audio = audioRef.current;
    const session = speechSession;

    if (!audio || !session) {
      return;
    }

    const durationMs = Number.isFinite(audio.duration) ? Math.max(0, audio.duration * 1000) : 0;
    if (durationMs <= 0) {
      return;
    }

    const nextProgress = clamp(progress, 0, 1);
    const nextTimeMs = durationMs * nextProgress;
    audio.currentTime = nextTimeMs / 1000;

    const snapshot = trackerRef.current?.updateFromClock(nextTimeMs);
    const nextCharIndex = snapshot?.currentCharIndex ?? 0;
    const currentWord = Math.min(
      playbackWindow.totalWords,
      Math.max(0, countWords(session.text.slice(0, nextCharIndex))),
    );

    setSpokenCharacterIndex(nextCharIndex);
    setPlaybackWindow((current) => ({
      ...current,
      elapsedMs: nextTimeMs,
      durationMs,
      progress: nextProgress,
      currentWord,
    }));
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  };

  const startListening = () => {
    const Recognition = getRecognitionConstructor();

    if (!Recognition) {
      return;
    }

    stopListening();

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      debugVoice("voice-command-listening-start");
      setIsListening(true);
      setLastCommand("Listening for commands");
    };

    recognition.onend = () => {
      debugVoice("voice-command-listening-end");
      setIsListening(false);
    };

    recognition.onerror = () => {
      debugVoice("voice-command-listening-error");
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript
        ?.trim()
        .toLowerCase();

      if (!transcript) {
        return;
      }

      debugVoice("voice-command-heard", { transcript });
      setLastCommand(`Heard: "${transcript}"`);

      if (transcript.includes("next")) {
        onSelectPage(clamp(selectedPage + 1, 1, pages.length));
        return;
      }

      if (transcript.includes("previous") || transcript.includes("back")) {
        onSelectPage(clamp(selectedPage - 1, 1, pages.length));
        return;
      }

      const pageMatch = transcript.match(/page\s+(\d{1,4})/);
      if (pageMatch) {
        const pageNumber = clamp(Number(pageMatch[1]), 1, pages.length);
        onSelectPage(pageNumber);
        if (transcript.includes("read") || transcript.includes("listen")) {
          speakPage(pages.find((page) => page.pageNumber === pageNumber) ?? null);
        }
        return;
      }

      if (transcript.includes("read") || transcript.includes("listen")) {
        speakPage();
        return;
      }

      if (transcript.includes("stop")) {
        stopSpeaking();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return {
    providers,
    selectedProvider,
    selectedProviderMeta,
    setSelectedProvider,
    voices,
    selectedVoice,
    selectedVoiceMeta,
    setSelectedVoice,
    rate,
    setRate,
    isSpeaking,
    isPaused,
    isListening,
    lastCommand,
    voiceError,
    loadingVoices,
    activity,
    playbackWindow,
    localRuntime,
    spokenCharacterIndex,
    activeCharacterIndex: spokenCharacterIndex + (speechSession?.charOffsetBase ?? 0),
    activeParagraphId: activeParagraph?.id ?? null,
    activePageNumber: speechSession?.pageNumber ?? null,
    playbackRangePageNumber: playbackRange.pageNumber,
    playbackRangeStartParagraphId: playbackRange.startParagraphId,
    playbackRangeEndParagraphId: playbackRange.endParagraphId,
    playbackParagraphStateById: playbackRange.stateByParagraphId,
    currentSessionLabel: speechSession?.label ?? "",
    currentSessionKind: speechSession?.kind ?? null,
    recognitionSupported,
    speakPage,
    speakFromParagraph,
    speakSelection,
    pauseOrResume,
    seekPlayback,
    seekToCharIndex,
    cancelRequest: () => {
      debugVoice("cancel-request");
      requestAbortRef.current?.abort();
    },
    stopSpeaking,
    startListening,
    stopListening,
    refreshProviders: async () => {
      setVoicesByProvider({});
      setSelectedVoice("");
      setVoiceError("");
      setActivity({
        phase: "idle",
        label: "Idle",
        detail: "Provider state refreshed.",
        scopeLabel: null,
        wordCount: null,
        provider: null,
        voice: null,
        cacheKey: null,
        audioUrl: null,
        cached: null,
        pageNumber: null,
        paragraphId: null,
      });
      setCapabilities(await fetchLineaVoiceCapabilities().catch(() => ({ alignment: false })));
      await refreshProviders();
    },
  };
}
