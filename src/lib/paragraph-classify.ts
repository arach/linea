/**
 * Heuristic paragraph classifier.
 *
 * Works at two levels:
 * 1. Inline spans — detects skippable ranges within a paragraph (emails,
 *    affiliations, citation markers, etc.) and dims them inline.
 * 2. Whole-paragraph — if >80% of the paragraph's characters fall within
 *    skippable spans, the entire paragraph is dimmed.
 */

export type SkipReason =
  | "authors"      // retained for backwards compatibility in existing state
  | "references"   // citation list items
  | "footnote"     // retained for backwards compatibility in existing state
  | "metadata"     // page numbers and similar tiny structural tokens
  | "toc"          // table of contents entries
  | "boilerplate"; // retained for backwards compatibility in existing state

export type SkipSpan = {
  start: number;
  end: number;
  reason: SkipReason;
};

export type ParagraphClassification = {
  skip: boolean;          // true if the entire paragraph should be dimmed
  reason: SkipReason | null;
  confidence: number;
  spans: SkipSpan[];      // inline ranges to dim (empty if skip=true)
};

// ── patterns ──

const NUMBERED_REF_RE = /^\[?\d{1,3}\]?\s+[A-Z][a-z]+/;
const DOI_TEST_RE = /\b(?:doi|https?:\/\/doi\.org)\b/i;
const TOC_RE = /^(?:table of contents|contents)\b/i;
const TOC_ENTRY_RE = /^[\d.]+\s+[A-Z].*\d{1,3}$/;
const PAGE_NUM_RE = /^\d{1,4}$/;
const REFERENCE_HEADING_RE = /^(?:references|bibliography|works cited|citations)\s*$/i;

// Inline citation markers: (Author, 2023), (Author et al., 2023), (OpenAI, 2023), [1], [1,2], [1-3]
const INLINE_CITATION_RE = /\([A-Z][\w]+(?:\s+(?:et\s+al\.|and\s+[A-Z][\w]+))?,?\s*\d{4}[a-z]?\)/g;
const BRACKET_CITATION_RE = /\[\d{1,3}(?:[,–-]\s*\d{1,3})*\]/g;

/**
 * Find skippable inline spans within a paragraph.
 */
function findSkipSpans(text: string): SkipSpan[] {
  const spans: SkipSpan[] = [];

  // Inline citations: (Author, 2023)
  for (const m of text.matchAll(INLINE_CITATION_RE)) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: "references" });
  }

  // Bracket citations: [1], [1,2]
  for (const m of text.matchAll(BRACKET_CITATION_RE)) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: "references" });
  }

  // Merge overlapping spans
  if (spans.length <= 1) return spans;
  spans.sort((a, b) => a.start - b.start);
  const merged: SkipSpan[] = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = spans[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

/**
 * Classify a single paragraph by its text content.
 */
export function classifyParagraph(
  text: string,
  context?: {
    pageNumber: number;
    index: number;
    total: number;
    isAfterReferenceHeading: boolean;
  },
): ParagraphClassification {
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // Very short — likely page number or label
  if (PAGE_NUM_RE.test(trimmed)) {
    return { skip: true, reason: "metadata", confidence: 0.9, spans: [] };
  }

  // Reference section heading
  if (REFERENCE_HEADING_RE.test(trimmed)) {
    return { skip: true, reason: "references", confidence: 0.95, spans: [] };
  }

  // After a "References" heading, everything is citations
  if (context?.isAfterReferenceHeading) {
    return { skip: true, reason: "references", confidence: 0.9, spans: [] };
  }

  // Numbered reference entries
  if (NUMBERED_REF_RE.test(trimmed) && (DOI_TEST_RE.test(trimmed) || /\(\d{4}\)/.test(trimmed) || /pp\.\s*\d/.test(trimmed))) {
    return { skip: true, reason: "references", confidence: 0.9, spans: [] };
  }

  // Table of contents
  if (TOC_RE.test(trimmed)) {
    return { skip: true, reason: "toc", confidence: 0.9, spans: [] };
  }
  if (TOC_ENTRY_RE.test(trimmed)) {
    return { skip: true, reason: "toc", confidence: 0.8, spans: [] };
  }

  const spans = findSkipSpans(trimmed);

  // Return inline spans for partial dimming
  return { skip: false, reason: null, confidence: 0, spans };
}

/**
 * Classify all paragraphs on a page, passing context between them.
 */
export function classifyPage(
  paragraphs: { text: string }[],
  pageNumber: number,
): ParagraphClassification[] {
  let isAfterReferenceHeading = false;

  return paragraphs.map((p, index) => {
    const result = classifyParagraph(p.text, {
      pageNumber,
      index,
      total: paragraphs.length,
      isAfterReferenceHeading,
    });

    if (REFERENCE_HEADING_RE.test(p.text.trim())) {
      isAfterReferenceHeading = true;
    }

    return result;
  });
}
