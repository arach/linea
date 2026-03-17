import { BookOpenText, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ReaderDocument } from "@/lib/pdf";
import { cn, formatCount, formatMinutes } from "@/lib/utils";

type ReaderMinimapProps = {
  document: ReaderDocument | null;
  selectedPage: number;
  onSelectPage: (pageNumber: number) => void;
};

export function ReaderMinimap({
  document,
  selectedPage,
  onSelectPage,
}: ReaderMinimapProps) {
  if (!document) {
    return (
      <Card className="min-h-[420px]">
        <CardHeader className="border-b border-border/40">
          <Badge>Linea map</Badge>
          <CardTitle className="text-xl">Minimap arrives with the PDF.</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-[300px] items-center justify-center">
          <div className="max-w-sm space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              The left rail becomes the quick-reading map: page density, primary excerpt, and a
              one-click jump target for the active reading pane.
            </p>
            <p>
              This keeps long papers and textbooks readable without forcing the user back into raw
              PDF page chrome.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-[340px] flex-col overflow-hidden bg-white/4">
      <CardHeader className="border-b border-border/40 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Badge>Document map</Badge>
            <CardTitle className="text-lg">{document.fileName}</CardTitle>
          </div>
          <div className="grid gap-1 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span>{document.pageCount} pages</span>
            <span>{formatCount(document.totalWords)} words</span>
            <span>{formatMinutes(document.estimatedMinutes)} listen time</span>
          </div>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {document.pages.map((page) => {
            const isActive = page.pageNumber === selectedPage;

            return (
              <button
                key={page.pageNumber}
                type="button"
                onClick={() => onSelectPage(page.pageNumber)}
                className={cn(
                  "group grid w-full grid-cols-[52px_minmax(0,1fr)] gap-3 rounded-[18px] border p-3 text-left transition-all duration-200",
                  isActive
                    ? "border-primary/45 bg-primary/10"
                    : "border-border/60 bg-white/4 hover:border-primary/25 hover:bg-white/8",
                )}
              >
                <div className="rounded-[14px] border border-white/8 bg-black/20 px-2 py-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Pg
                  </div>
                  <div className="mt-1 text-lg font-semibold">{page.pageNumber}</div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="line-clamp-2 font-medium leading-5">{page.title}</div>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                        {page.preview}
                      </p>
                    </div>
                    <ChevronRight
                      className={cn(
                        "mt-0.5 size-4 shrink-0 transition-transform",
                        isActive ? "translate-x-1 text-primary" : "text-muted-foreground",
                      )}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <BookOpenText className="size-3.5" />
                      {page.wordCount ? `${formatCount(page.wordCount)} words` : "No text"}
                    </span>
                    <span>{page.hasText ? "Readable" : "OCR next"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
