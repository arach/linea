import { FileUp, LoaderCircle, ScanText, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExtractionProgress } from "@/lib/pdf";
import { cn } from "@/lib/utils";

type PdfDropzoneProps = {
  onFile: (file: File) => void;
  loading: boolean;
  progress: ExtractionProgress | null;
};

export function PdfDropzone({ onFile, loading, progress }: PdfDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || file.type !== "application/pdf") {
      return;
    }

    onFile(file);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="accent">Local-first PDF intake</Badge>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <Sparkles className="size-4 text-primary" />
            No uploads
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle className="max-w-sm leading-tight">
            Drop in a paper, chapter, or course pack and start shaping the reading surface.
          </CardTitle>
          <CardDescription className="max-w-lg text-balance">
            The scaffold extracts text with PDF.js, builds page-level navigation, and keeps the
            browser voice layer swappable for your local voice runtime.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "group relative flex w-full flex-col items-start gap-5 rounded-[24px] border border-dashed p-6 text-left transition-all duration-300",
            isDragging
              ? "border-primary bg-primary/12 shadow-[0_0_0_1px_rgba(247,203,110,0.35)]"
              : "border-border/70 bg-white/4 hover:border-primary/45 hover:bg-white/7",
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(247,203,110,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(81,157,255,0.16),transparent_42%)] opacity-90" />
          <div className="relative flex size-14 items-center justify-center rounded-2xl border border-white/14 bg-black/20">
            {loading ? (
              <LoaderCircle className="size-7 animate-spin text-primary" />
            ) : (
              <FileUp className="size-7 text-primary" />
            )}
          </div>

          <div className="relative space-y-2">
            <div className="text-lg font-semibold tracking-tight">
              {loading ? "Processing your PDF locally" : "Drag and drop a PDF here"}
            </div>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">
              {loading
                ? progress?.totalPages
                  ? `Extracting readable text from ${progress.loadedPages} of ${progress.totalPages} pages.`
                  : "Initializing PDF.js and preparing the reader shell."
                : "This first pass focuses on one PDF at a time. Replace it any time to re-shape the layout and voice loop."}
            </p>
          </div>

          <div className="relative flex flex-wrap items-center gap-3">
            <Button type="button" variant="default" disabled={loading}>
              {loading ? "Building reader view" : "Choose PDF"}
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ScanText className="size-4 text-primary" />
              PDF.js text extraction, local voice scaffold, SSR shell
            </div>
          </div>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </CardContent>
    </Card>
  );
}
