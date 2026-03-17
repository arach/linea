import { ChevronLeft, ChevronRight, FileText, Headphones, ScanSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReaderDocument } from "@/lib/pdf";
import { cn, formatCount } from "@/lib/utils";

type ReaderFocusProps = {
  document: ReaderDocument | null;
  selectedPage: number;
  activeParagraphId?: string | null;
  onSelectPage: (pageNumber: number) => void;
};

export function ReaderFocus({
  document,
  selectedPage,
  activeParagraphId,
  onSelectPage,
}: ReaderFocusProps) {
  if (!document) {
    return (
      <Card className="min-h-[720px] overflow-hidden">
        <CardHeader className="gap-4 border-b border-border/40">
          <Badge>Reading stage</Badge>
          <CardTitle className="max-w-lg text-3xl leading-tight">
            The focused pane turns dense PDFs into a navigable reading surface.
          </CardTitle>
        </CardHeader>
        <CardContent className="grid min-h-[560px] gap-4 pt-6 lg:grid-cols-2">
          {[
            {
              icon: FileText,
              title: "Readable text layer",
              body: "Extracted text gets elevated out of the PDF frame so users can read, skim, and later annotate without fighting page chrome.",
            },
            {
              icon: ScanSearch,
              title: "Page-aware navigation",
              body: "The current page anchors the reading pane while the minimap keeps context, density, and progression visible.",
            },
            {
              icon: Headphones,
              title: "Voice-ready handoff",
              body: "Speech controls are already framed as their own dock so your local voice runtime can slot in without reshaping the product.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className={cn(
                "rounded-[24px] border border-border/50 bg-white/4 p-6",
                feature.title === "Voice-ready handoff" && "lg:col-span-2",
              )}
            >
              <feature.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-xl font-semibold tracking-tight">{feature.title}</h3>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                {feature.body}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const page = document.pages.find((entry) => entry.pageNumber === selectedPage) ?? document.pages[0];

  return (
    <Card className="min-h-[720px] overflow-hidden">
      <CardHeader className="gap-5 border-b border-border/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge variant="accent">Focused reading</Badge>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {document.fileName}
              </div>
              <CardTitle className="max-w-3xl text-3xl leading-tight">{page.title}</CardTitle>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => onSelectPage(Math.max(1, selectedPage - 1))}
              disabled={selectedPage === 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={() => onSelectPage(Math.min(document.pageCount, selectedPage + 1))}
              disabled={selectedPage === document.pageCount}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span>Page {page.pageNumber}</span>
          <span>{formatCount(page.wordCount)} words</span>
          <span>{page.hasText ? "Extracted text ready" : "No text layer detected"}</span>
        </div>
      </CardHeader>

      <CardContent className="pt-8">
        {page.hasText ? (
          <article className="mx-auto max-w-4xl space-y-5 text-[1.05rem] leading-8 text-foreground/92">
            {page.paragraphs.map((paragraph) => (
              <p
                key={paragraph.id}
                className={cn(
                  "rounded-[18px] px-3 py-2 transition-colors duration-200",
                  activeParagraphId === paragraph.id && "bg-primary/10 text-primary-foreground",
                )}
              >
                {paragraph.text}
              </p>
            ))}
          </article>
        ) : (
          <div className="mx-auto max-w-2xl rounded-[24px] border border-border/50 bg-white/5 p-8">
            <h3 className="font-serif text-2xl">No extractable text on this page yet.</h3>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              This usually means the PDF page is image-based or needs OCR. The scaffold is ready for
              an OCR step later, but this first pass keeps the browser-only stack lean.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
