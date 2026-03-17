import { ChevronLeft, ChevronRight, FileText, Headphones, ScanSearch, Volume2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReaderDocument, ReaderParagraph } from "@/lib/pdf";
import {
  type ReaderSettings,
  readerFonts,
  readerThemes,
} from "@/lib/reader-presentation";
import { cn, formatCount } from "@/lib/utils";

type ReaderFocusProps = {
  document: ReaderDocument | null;
  selectedPage: number;
  activeParagraphId?: string | null;
  settings: ReaderSettings;
  onSelectText: (selection: { text: string; paragraphId: string | null } | null) => void;
  onReadFromParagraph: (paragraph: ReaderParagraph) => void;
  onSelectPage: (pageNumber: number) => void;
};

export function ReaderFocus({
  document,
  selectedPage,
  activeParagraphId,
  settings,
  onSelectText,
  onReadFromParagraph,
  onSelectPage,
}: ReaderFocusProps) {
  const articleRef = useRef<HTMLElement | null>(null);

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
  const theme = readerThemes[settings.theme];
  const font = readerFonts[settings.font];

  useEffect(() => {
    onSelectText(null);
  }, [onSelectText, page.pageNumber]);

  const handleSelection = () => {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || !articleRef.current) {
      onSelectText(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      onSelectText(null);
      return;
    }

    const anchorNode = selection.anchorNode;
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null;

    if (!anchorElement || !articleRef.current.contains(anchorElement)) {
      onSelectText(null);
      return;
    }

    const paragraphElement = anchorElement.closest<HTMLElement>("[data-paragraph-id]");
    onSelectText({
      text,
      paragraphId: paragraphElement?.dataset.paragraphId ?? null,
    });
  };

  return (
    <Card className={cn("min-h-[calc(100vh-8rem)] overflow-hidden", theme.surfaceClass)}>
      <CardHeader className={cn("gap-5 border-b px-8 py-7 md:px-10", theme.chromeClass)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge variant="accent">Reading view</Badge>
            <div className="space-y-2">
              <div className={cn("text-[11px] font-semibold uppercase tracking-[0.24em]", theme.mutedClass)}>
                {document.fileName}
              </div>
              <CardTitle className={cn("max-w-4xl text-4xl leading-tight md:text-5xl", theme.titleClass)}>
                {page.title}
              </CardTitle>
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

        <div className={cn("flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.2em]", theme.mutedClass)}>
          <span>Page {page.pageNumber}</span>
          <span>{formatCount(page.wordCount)} words</span>
          <span>{page.hasText ? "Extracted text ready" : "No text layer detected"}</span>
        </div>
      </CardHeader>

      <CardContent className="px-6 py-8 md:px-10 md:py-10">
        {page.hasText ? (
          <article
            ref={articleRef}
            onMouseUp={handleSelection}
            onKeyUp={handleSelection}
            className={cn("mx-auto max-w-[820px] space-y-5 antialiased", font.className)}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            {page.paragraphs.map((paragraph) => (
              <button
                key={paragraph.id}
                type="button"
                data-paragraph-id={paragraph.id}
                onClick={() => onReadFromParagraph(paragraph)}
                className={cn(
                  "group block w-full cursor-text select-text rounded-[18px] px-4 py-3 text-left transition-colors duration-200",
                  activeParagraphId === paragraph.id && theme.activeParagraphClass,
                )}
              >
                <span className="mb-2 hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80 group-hover:inline-flex">
                  <Volume2 className="size-3.5" />
                  Read from here
                </span>
                <span>{paragraph.text}</span>
              </button>
            ))}
          </article>
        ) : (
          <div className={cn("mx-auto max-w-2xl rounded-[24px] border p-8", theme.chromeClass)}>
            <h3 className="font-serif text-2xl">No extractable text on this page yet.</h3>
            <p className={cn("mt-4 text-sm leading-7", theme.mutedClass)}>
              This usually means the PDF page is image-based or needs OCR. The scaffold is ready for
              an OCR step later, but this first pass keeps the browser-only stack lean.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
