import { AudioLines, BookMarked, LibraryBig, Orbit, Sparkles } from "lucide-react";
import { startTransition, useMemo, useState } from "react";

import { PdfDropzone } from "@/components/pdf-dropzone";
import { ReaderFocus } from "@/components/reader-focus";
import { ReaderMinimap } from "@/components/reader-minimap";
import { VoiceConsole } from "@/components/voice-console";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ExtractionProgress, ReaderDocument } from "@/lib/pdf";
import { loadReaderDocument } from "@/lib/pdf";
import { useVoiceConsole } from "@/lib/voice";

type AppProps = {
  initialDocument: ReaderDocument | null;
};

export function App({ initialDocument }: AppProps) {
  const [document, setDocument] = useState<ReaderDocument | null>(initialDocument);
  const [selectedPage, setSelectedPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [error, setError] = useState("");

  const currentPage = useMemo(
    () => document?.pages.find((page) => page.pageNumber === selectedPage) ?? null,
    [document, selectedPage],
  );

  const voice = useVoiceConsole({
    pages: document?.pages ?? [],
    selectedPage,
    onSelectPage: setSelectedPage,
  });

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(247,203,110,0.18),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(90,167,255,0.22),transparent_34%),linear-gradient(180deg,#090b11_0%,#0d1220_42%,#090b11_100%)]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="absolute left-[12%] top-24 h-56 w-56 rounded-full bg-primary/18 blur-[120px]" />
        <div className="absolute bottom-0 right-[10%] h-72 w-72 rounded-full bg-sky-400/12 blur-[140px]" />
      </div>

      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 lg:px-8">
        {!document ? (
          <section className="flex min-h-[calc(100vh-3rem)] items-center">
            <div className="mx-auto grid w-full max-w-[1080px] gap-6">
              <div className="space-y-4 text-center">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Badge variant="accent">Linea / app shell</Badge>
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
                  <p className="mx-auto max-w-2xl text-base leading-8 text-muted-foreground">
                    Local parsing first. Then page structure, paragraph flow, caching, and voice.
                  </p>
                </div>
              </div>

              {error ? (
                <Card className="border-rose-300/30 bg-rose-300/10">
                  <CardContent className="p-5 text-sm leading-7 text-rose-100">{error}</CardContent>
                </Card>
              ) : null}

              <PdfDropzone onFile={handleFile} loading={loading} progress={progress} />

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    icon: LibraryBig,
                    title: "Parse once, reuse often",
                    body: "The next pass should persist a versioned reading model so reopening a PDF does not require a full remap.",
                  },
                  {
                    icon: AudioLines,
                    title: "Voice stays modular",
                    body: "The browser speech layer remains a placeholder dock until your local voice runtime is wired in.",
                  },
                  {
                    icon: Sparkles,
                    title: "Recent readings later",
                    body: "This empty-state space can become the document finder once local caching and indexing are in place.",
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
              <Card className="mb-6 border-rose-300/30 bg-rose-300/10">
                <CardContent className="p-5 text-sm leading-7 text-rose-100">{error}</CardContent>
              </Card>
            ) : null}

            <header className="mb-6 rounded-[28px] border border-border/50 bg-white/5 px-5 py-4 backdrop-blur-xl md:px-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="accent">Linea</Badge>
                    <Badge>{document.fileName}</Badge>
                  </div>
                  <div className="text-sm leading-7 text-muted-foreground">
                    Active page {selectedPage} of {document.pageCount}. Extracted text first, page
                    context always visible.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="rounded-full border border-border/60 px-3 py-2">
                    Local session
                  </span>
                  <span className="rounded-full border border-border/60 px-3 py-2">
                    Voice-ready
                  </span>
                  <span className="rounded-full border border-border/60 px-3 py-2">
                    PDF.js
                  </span>
                </div>
              </div>
            </header>

            <section className="grid gap-6 xl:grid-cols-[minmax(340px,0.37fr)_minmax(0,0.63fr)]">
              <div className="space-y-6">
                <ReaderMinimap
                  document={document}
                  selectedPage={selectedPage}
                  onSelectPage={setSelectedPage}
                />
              </div>

              <div className="space-y-6">
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

                <ReaderFocus
                  document={document}
                  selectedPage={selectedPage}
                  activeParagraphId={voice.activeParagraphId}
                  onSelectPage={setSelectedPage}
                />
              </div>
            </section>

            <div className="mt-6 text-center text-xs uppercase tracking-[0.24em] text-muted-foreground">
              <BookMarked className="mr-2 inline size-4 text-primary" />
              Active page {selectedPage} of {document.pageCount}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
