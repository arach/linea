import type { ReaderDocument, ReaderPage, ReaderParagraph } from "@/lib/pdf";

type DemoPageSeed = {
  title: string;
  paragraphs: string[];
};

const demoPageSeeds: DemoPageSeed[] = [
  {
    title: "A Reader Built Like A Work Surface",
    paragraphs: [
      "Linea is easier to understand when it opens on a real reading surface instead of a blank drop target. This demo document is intentionally processed ahead of time so the minimap, the focus pane, and the playback controls can all show up together in one coherent state.",
      "The layout is meant to feel like a private reading desk rather than a product landing page. The left rail holds navigation and utilities. The main column gives the text room to breathe. Playback stays close enough to act on, but not so large that it competes with the document.",
      "Think of this page as a gentle onboarding artifact. It is not trying to imitate a PDF viewer. It is trying to prove what a PDF becomes after extraction, segmentation, and voice-aware presentation are treated as first-class concerns.",
    ],
  },
  {
    title: "The Minimap Should Carry Context",
    paragraphs: [
      "The minimap is not just a page list. It should help the reader understand where dense sections live, where a chapter changes tone, and where a useful passage might be hiding. A compact preview, page count, and word density are often enough to make navigation feel deliberate rather than blind.",
      "That is why the left rail in this prototype is utility-only. It is allowed to be narrow, but it still needs to communicate document structure. The reader should be able to jump with confidence and recover their place without relying on the visual chrome of the original PDF.",
      "Once the reading surface is stable, more advanced features can layer in naturally: search, annotations, extracted headings, follow-along states, and later even synchronized notes. But the first win is simply making navigation feel calm and predictable.",
    ],
  },
  {
    title: "Playback Needs A Visible Cursor",
    paragraphs: [
      "Voice playback becomes trustworthy when the interface can answer a simple question at any moment: where are we right now? In a browser-speech path that means boundary events. In a remote audio path that means marks when available, and a timeline estimate when marks are missing.",
      "The active paragraph highlight is less about decoration than about orientation. It tells the reader which region of text belongs to the current utterance. The floating player then becomes a session summary: page, paragraph, mode, and selection handoff all in one persistent control surface.",
      "This demo keeps the playback layer simple on purpose. The point is to show the relationship between a spoken cursor and a document cursor. Once that relationship feels solid, a richer local runtime or cloud provider can be swapped in underneath without reshaping the UI.",
    ],
  },
  {
    title: "Selection, Focus, And Re-Entry",
    paragraphs: [
      "A useful reader has to support interruption. The user might skim with their eyes, select a passage, read just that portion aloud, then return to the broader page. That means selection should not feel like a secondary action. It should be part of the same reading loop as play, pause, and stop.",
      "Buttons that read from a paragraph or read a selected excerpt work best when they are attached to visible ranges of text. Re-entry matters here: when playback is resumed, the user should understand whether they are resuming a whole page, a paragraph start, or an isolated selection.",
      "That is also why the surface should avoid overexplaining itself. Small labels, direct controls, and stable placement do more work than giant callouts. The interface should feel easy to catch up with even if you have not touched it in a few days.",
    ],
  },
  {
    title: "A Good Demo Should Invite Replacement",
    paragraphs: [
      "The strongest preload state is one the user can immediately replace. As soon as this demo makes the structure legible, the next obvious action should be opening a real PDF. That keeps the example from feeling like marketing and turns it into a practical orientation step.",
      "A bundled document is also a good place to test design decisions. If the minimap feels too dense, if the active paragraph treatment is too loud, or if the floating player blocks reading, those problems reveal themselves quickly when the app starts in a populated state every time.",
      "For Linea, the right move is to treat this example as a reader playground. It should help you inspect the renderer, the map, the playback surfaces, and the spacing system side by side. Then you can swap in your own document and see whether the product still holds together.",
    ],
  },
];

function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function createParagraphs(pageNumber: number, paragraphs: string[]): ReaderParagraph[] {
  let cursor = 0;

  return paragraphs.map((text, index) => {
    const start = cursor;
    const end = start + text.length;
    cursor = end + 2;

    return {
      id: `demo-page-${pageNumber}-paragraph-${index + 1}`,
      text,
      start,
      end,
    };
  });
}

function createPage(seed: DemoPageSeed, pageNumber: number): ReaderPage {
  const paragraphs = createParagraphs(pageNumber, seed.paragraphs);
  const text = paragraphs.map((paragraph) => paragraph.text).join("\n\n");
  const lines = seed.paragraphs.flatMap((paragraph) => paragraph.split(/(?<=\.)\s+/));
  const wordCount = countWords(text);
  const charCount = text.length;
  const width = 612;
  const height = 792;

  return {
    pageNumber,
    title: seed.title,
    preview: paragraphs[0]?.text.slice(0, 180) ?? "",
    text,
    lines,
    paragraphs,
    wordCount,
    charCount,
    width,
    height,
    density: charCount / (width * height),
    hasText: true,
  };
}

export function getDemoReaderDocument(): ReaderDocument {
  const pages = demoPageSeeds.map((seed, index) => createPage(seed, index + 1));
  const totalWords = pages.reduce((sum, page) => sum + page.wordCount, 0);

  return {
    fileName: "Linea Reader Playground.pdf",
    pageCount: pages.length,
    totalWords,
    estimatedMinutes: Math.max(1, Math.ceil(totalWords / 155)),
    loadedAt: "2026-03-18T00:00:00.000Z",
    pages,
  };
}
