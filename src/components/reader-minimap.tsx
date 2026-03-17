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
          <Badge>Reader map</Badge>
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
    <Card className="flex min-h-[560px] flex-col overflow-hidden">
      <CardHeader className="border-b border-border/40 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Badge>Document map</Badge>
            <CardTitle className="text-xl">{document.fileName}</CardTitle>
          </div>
          <div className="grid gap-1 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span>{document.pageCount} pages</span>
            <span>{formatCount(document.totalWords)} words</span>
            <span>{formatMinutes(document.estimatedMinutes)} listen time</span>
          </div>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {document.pages.map((page) => {
            const intensity = Math.max(12, Math.min(100, page.wordCount / 4));
            const isActive = page.pageNumber === selectedPage;

            return (
              <button
                key={page.pageNumber}
                type="button"
                onClick={() => onSelectPage(page.pageNumber)}
                className={cn(
                  "group w-full rounded-[22px] border p-4 text-left transition-all duration-200",
                  isActive
                    ? "border-primary/55 bg-primary/10 shadow-[0_22px_40px_-26px_rgba(247,203,110,0.75)]"
                    : "border-border/60 bg-white/4 hover:border-primary/30 hover:bg-white/8",
                )}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Page {page.pageNumber}
                    </div>
                    <div className="mt-2 line-clamp-2 font-medium leading-5">{page.title}</div>
                  </div>
                  <ChevronRight
                    className={cn(
                      "mt-0.5 size-4 shrink-0 transition-transform",
                      isActive ? "translate-x-1 text-primary" : "text-muted-foreground",
                    )}
                  />
                </div>

                <div className="mb-4 overflow-hidden rounded-[18px] border border-white/8 bg-black/20 p-3">
                  <div className="flex gap-2">
                    <div className="w-1 rounded-full bg-primary/60" />
                    <div className="min-w-0 flex-1 space-y-2">
                      {[0, 1, 2, 3].map((line) => (
                        <div
                          key={line}
                          className="h-1.5 rounded-full bg-white/10"
                          style={{
                            width: `${Math.max(24, Math.min(96, intensity - line * 9))}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {page.preview}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <BookOpenText className="size-3.5" />
                    {page.wordCount ? `${formatCount(page.wordCount)} words` : "No text"}
                  </span>
                  <span>{page.hasText ? "Readable" : "OCR next"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
