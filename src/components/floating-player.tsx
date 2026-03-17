import { Headphones, Pause, Play, Quote, Square, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FloatingPlayerProps = {
  isSpeaking: boolean;
  isPaused: boolean;
  activePageNumber: number;
  activeParagraphId: string | null;
  currentSessionLabel: string;
  currentSessionKind: "page" | "paragraph" | "selection" | null;
  hasSelection: boolean;
  selectionPreview: string;
  onPauseOrResume: () => void;
  onStop: () => void;
  onReadSelection: () => void;
};

export function FloatingPlayer({
  isSpeaking,
  isPaused,
  activePageNumber,
  activeParagraphId,
  currentSessionLabel,
  currentSessionKind,
  hasSelection,
  selectionPreview,
  onPauseOrResume,
  onStop,
  onReadSelection,
}: FloatingPlayerProps) {
  return (
    <div className="fixed bottom-4 left-1/2 z-30 w-[min(calc(100vw-1.5rem),780px)] -translate-x-1/2 md:bottom-6">
      <Card className="border-border/70 bg-[color-mix(in_srgb,#111827_88%,transparent)] shadow-[0_30px_70px_-36px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 px-2.5 py-1">
                <Waves className="size-3.5 text-primary" />
                Overlay playback
              </span>
              <span className="rounded-full border border-border/60 px-2.5 py-1">Page {activePageNumber}</span>
              {activeParagraphId ? (
                <span className="rounded-full border border-border/60 px-2.5 py-1">
                  {activeParagraphId.replaceAll("-", " ")}
                </span>
              ) : null}
            </div>
            <div className="text-sm font-medium text-foreground">
              {currentSessionLabel || "Click a paragraph to begin reading from that point."}
            </div>
            {hasSelection ? (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Quote className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="line-clamp-2">{selectionPreview}</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Select a passage, then use this player to read just that excerpt.
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant={hasSelection ? "secondary" : "outline"} onClick={onReadSelection} disabled={!hasSelection}>
              <Headphones className="size-4" />
              Read selection
            </Button>
            <Button onClick={onPauseOrResume} className={cn(currentSessionKind ? "" : "opacity-90")}>
              {isPaused || !isSpeaking ? <Play className="size-4" /> : <Pause className="size-4" />}
              {isPaused ? "Resume" : isSpeaking ? "Pause" : "Play"}
            </Button>
            <Button variant="outline" onClick={onStop}>
              <Square className="size-4" />
              Stop
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
