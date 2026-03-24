import { Mic, MicOff, Pause, Play, Square, Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LineaVoice } from "@/lib/linea-voice";

type VoiceConsoleProps = {
  recognitionSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  rate: number;
  setRate: (rate: number) => void;
  selectedVoice: string;
  setSelectedVoice: (name: string) => void;
  voices: LineaVoice[];
  lastCommand: string;
  activeParagraphId: string | null;
  onSpeak: () => void;
  onPauseOrResume: () => void;
  onStop: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
};

export function VoiceConsole({
  recognitionSupported,
  isListening,
  isSpeaking,
  isPaused,
  rate,
  setRate,
  selectedVoice,
  setSelectedVoice,
  voices,
  lastCommand,
  activeParagraphId,
  onSpeak,
  onPauseOrResume,
  onStop,
  onStartListening,
  onStopListening,
}: VoiceConsoleProps) {
  return (
    <Card className="overflow-hidden bg-white/4">
      <CardHeader className="gap-3 border-b border-border/40 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge>Voice loop</Badge>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <Waves className="size-4 text-primary" />
            Browser scaffold
          </div>
        </div>
        <CardTitle className="text-lg">Speech</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={onSpeak} className="justify-start">
            <Play className="size-4" />
            Read page
          </Button>
          <Button variant="secondary" onClick={onPauseOrResume} className="justify-start">
            <Pause className="size-4" />
            {isPaused ? "Resume" : isSpeaking ? "Pause" : "Play here"}
          </Button>
          <Button variant="outline" onClick={onStop} className="justify-start">
            <Square className="size-4" />
            Stop
          </Button>
          <Button
            variant={isListening ? "default" : "outline"}
            onClick={isListening ? onStopListening : onStartListening}
            className="justify-start"
            disabled={!recognitionSupported}
          >
            {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            {recognitionSupported
              ? isListening
                ? "Stop commands"
                : "Start commands"
              : "Input unavailable"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
          <label className="space-y-2 text-sm">
            <span className="block uppercase tracking-[0.2em] text-muted-foreground">
              Voice
            </span>
            <select
              value={selectedVoice}
              onChange={(event) => setSelectedVoice(event.target.value)}
              className="h-11 w-full rounded-2xl border border-border/70 bg-white/6 px-4 outline-none transition focus:border-primary/50"
            >
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="block uppercase tracking-[0.2em] text-muted-foreground">
              Rate {rate.toFixed(1)}x
            </span>
            <input
              type="range"
              min="0.7"
              max="1.4"
              step="0.1"
              value={rate}
              onChange={(event) => setRate(Number(event.target.value))}
              className="h-10 w-full accent-[var(--primary)]"
            />
          </label>
        </div>

        <div className="rounded-[18px] border border-border/50 bg-black/20 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Status
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {lastCommand ||
              "Wire this panel into your local voice runtime later. For now it proves the control surface and progress handoff."}
          </p>
          {activeParagraphId ? (
            <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-primary">
              Tracking {activeParagraphId.replaceAll("-", " ")}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
