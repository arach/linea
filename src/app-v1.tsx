import { AudioLines, LibraryBig, Orbit, Sparkles, Upload } from "lucide-react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { FloatingPlayer } from "@/components/floating-player";
import { PdfDropzone } from "@/components/pdf-dropzone";
import { ProviderCredentials } from "@/components/provider-credentials";
import { ReaderFocus } from "@/components/reader-focus";
import { ReaderMinimap } from "@/components/reader-minimap";
import { ReaderSettings } from "@/components/reader-settings";
import { VoiceConsole } from "@/components/voice-console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ExtractionProgress, ReaderDocument, ReaderParagraph } from "@/lib/pdf";
import { loadReaderDocument } from "@/lib/pdf";
import {
  defaultReaderSettings,
  type ReaderSettings as ReaderSettingsState,
} from "@/lib/reader-presentation";
import { useVoiceConsole } from "@/lib/voice";

type AppProps = {
  initialDocument: ReaderDocument | null;
};

export function App({ initialDocument }: AppProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<ReaderDocument | null>(initialDocument);
  const [selectedPage, setSelectedPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<ReaderSettingsState>(defaultReaderSettings);
  const [selectedPassage, setSelectedPassage] = useState<{
    text: string;
    paragraphId: string | null;
  } | null>(null);

  const currentPage = useMemo(
    () => document?.pages.find((page) => page.pageNumber === selectedPage) ?? null,
    [document, selectedPage],
  );

  const voice = useVoiceConsole({
    pages: document?.pages ?? [],
    selectedPage,
    onSelectPage: setSelectedPage,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedSettings = window.localStorage.getItem("linea:reader-settings");

    if (!savedSettings) {
      return;
    }

    try {
      const parsedSettings = JSON.parse(savedSettings) as Partial<ReaderSettingsState>;

      setSettings((current) => ({
        ...current,
        ...parsedSettings,
      }));
    } catch {
      window.localStorage.removeItem("linea:reader-settings");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("linea:reader-settings", JSON.stringify(settings));
  }, [settings]);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError("");
    setProgress(null);
    voice.stopSpeaking();
    voice.stopListening();

    try {
      const nextDocument = await loadReaderDocument(file, setProgress);
      startTransition(() => {
        setDocument(nextDocument);
        setSelectedPage(1);
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The PDF could not be parsed in this first-pass scaffold.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReplacementFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || file.type !== "application/pdf") {
      return;
    }

    void handleFile(file);
  };

  const handleReadFromParagraph = (paragraph: ReaderParagraph) => {
    const selection = typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "";
    if (selection) {
      return;
    }

    voice.speakFromParagraph(currentPage, paragraph);
  };

  const handleReadSelection = () => {
    if (!selectedPassage) {
      return;
    }

    voice.speakSelection(selectedPassage.text, currentPage, selectedPassage.paragraphId);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(247,203,110,0.12),transparent_28%),radial-gradient(circle_at_100%_0%,rgba(90,167,255,0.16),transparent_34%),linear-gradient(180deg,#0a0e17_0%,#0f1422_45%,#0a0e17_100%)]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="absolute left-[10%] top-16 h-48 w-48 rounded-full bg-primary/14 blur-[120px]" />
      </div>

      <main className="mx-auto max-w-[1680px] px-4 py-5 md:px-5 lg:px-6">
        {!document ? (
          <section className="flex min-h-[calc(100vh-3rem)] items-center">
            <div className="mx-auto grid w-full max-w-[920px] gap-6">
              <div className="space-y-4 text-center">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Badge variant="accent">Linea / workspace</Badge>
                  <Badge>Local PDF intake</Badge>
                </div>
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-3 text-sm uppercase tracking-[0.28em] text-muted-foreground">
                    <Orbit className="size-4 text-primary" />
                    Start with the document
                  </div>
                  <h1 className="mx-auto max-w-4xl font-serif text-5xl leading-[0.96] tracking-[-0.04em] text-balance md:text-6xl">
                    Drop in a PDF and shape the reading surface from the file outward.
                  </h1>
                  <p className="mx-auto max-w-xl text-base leading-8 text-muted-foreground">
                    Keep the intake simple. Then tune readability, follow-along, caching, and voice
                    as the app grows.
                  </p>
                </div>
              </div>

              {error ? (
                <Card className="border-rose-300/30 bg-rose-300/10">
                  <CardContent className="p-5 text-sm leading-7 text-rose-100">{error}</CardContent>
                </Card>
              ) : null}

              <PdfDropzone onFile={handleFile} loading={loading} progress={progress} />

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild variant="secondary">
                  <a href="/playground">Open example reader</a>
                </Button>
                <span className="text-sm text-muted-foreground">
                  Load a pre-processed demo document with the minimap, focus view, and playback
                  surfaces already in place.
                </span>
              </div>

              <ProviderCredentials />

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    icon: LibraryBig,
                    title: "Reading-first",
                    body: "The document view should feel like a workspace, not a landing page dressed up as one.",
                  },
                  {
                    icon: AudioLines,
                    title: "Follow-along next",
                    body: "Reading progress should become a stable cursor shared by voice, map, and focused text.",
                  },
                  {
                    icon: Sparkles,
                    title: "Settings built in",
                    body: "Font, size, line height, and themes should be first-class controls, not afterthoughts.",
                  },
                ].map((item) => (
                  <Card key={item.title} className="bg-white/4">
                    <CardContent className="p-5">
                      <item.icon className="size-5 text-primary" />
                      <h2 className="mt-4 text-lg font-semibold tracking-tight">{item.title}</h2>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.body}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
            {error ? (
              <Card className="mb-5 border-rose-300/30 bg-rose-300/10">
                <CardContent className="p-5 text-sm leading-7 text-rose-100">{error}</CardContent>
              </Card>
            ) : null}

            <header className="mb-5 rounded-[24px] border border-border/50 bg-black/20 px-4 py-3 backdrop-blur-xl md:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="accent">Linea</Badge>
                    <Badge>{document.fileName}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Page {selectedPage} of {document.pageCount}. The reading pane is primary; the
                    rail stays utility-only.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border/60 px-3 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Local session
                  </span>
                  <span className="rounded-full border border-border/60 px-3 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Voice-ready
                  </span>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="size-3.5" />
                    Open another PDF
                  </Button>
                </div>
              </div>
            </header>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) => handleReplacementFile(event.target.files)}
            />

            <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-5">
                <ReaderSettings settings={settings} onChange={setSettings} />
                <ProviderCredentials />
                <ReaderMinimap
                  document={document}
                  selectedPage={selectedPage}
                  onSelectPage={setSelectedPage}
                />
                <VoiceConsole
                  recognitionSupported={voice.recognitionSupported}
                  isListening={voice.isListening}
                  isSpeaking={voice.isSpeaking}
                  isPaused={voice.isPaused}
                  rate={voice.rate}
                  setRate={voice.setRate}
                  selectedVoice={voice.selectedVoice}
                  setSelectedVoice={voice.setSelectedVoice}
                  voices={voice.voices}
                  lastCommand={voice.lastCommand}
                  activeParagraphId={voice.activeParagraphId}
                  onSpeak={() => voice.speakPage(currentPage ?? undefined)}
                  onPauseOrResume={voice.pauseOrResume}
                  onStop={voice.stopSpeaking}
                  onStartListening={voice.startListening}
                  onStopListening={voice.stopListening}
                />
              </div>

              <div className="min-w-0">
                <ReaderFocus
                  document={document}
                  selectedPage={selectedPage}
                  activeParagraphId={voice.activeParagraphId}
                  settings={settings}
                  onSelectText={setSelectedPassage}
                  onReadFromParagraph={handleReadFromParagraph}
                  onSelectPage={setSelectedPage}
                />
              </div>
            </section>

            <FloatingPlayer
              isSpeaking={voice.isSpeaking}
              isPaused={voice.isPaused}
              activePageNumber={voice.activePageNumber}
              activeParagraphId={voice.activeParagraphId}
              currentSessionLabel={voice.currentSessionLabel}
              currentSessionKind={voice.currentSessionKind}
              hasSelection={Boolean(selectedPassage?.text)}
              selectionPreview={selectedPassage?.text ?? ""}
              onPauseOrResume={voice.pauseOrResume}
              onStop={voice.stopSpeaking}
              onReadSelection={handleReadSelection}
            />
          </>
        )}
      </main>
    </div>
  );
}
