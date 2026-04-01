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
  | "authors"      // author names, affiliations, emails
  | "references"   // citation list items
  | "footnote"     // footnote markers or short annotation text
  | "metadata"     // dates, identifiers, copyright, page numbers
  | "toc"          // table of contents entries
  | "boilerplate"; // disclaimers, legal text

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

const EMAIL_RE = /[\w.-]+@[\w.-]+\.\w{2,}/g;
const EMAIL_SINGLE_RE = /[\w.-]+@[\w.-]+\.\w{2,}/;
const AFFILIATION_RE = /\b(university|institute|department|faculty|school of|college of|laboratory|lab)\b/i;
const AUTHOR_LIST_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?:\s*[,&]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}){1,}/;
const NUMBERED_REF_RE = /^\[?\d{1,3}\]?\s+[A-Z][a-z]+/;
const TITLE_AUTHOR_RE = /^[A-Z][\w-]*(?:\s+[A-Z][\w-]*){2,}(?:\s+[∗*†‡])?$/;
const ARXIV_RE = /\barxiv[:\s]?\d{4}\.\d{4,5}(?:v\d+)?\b/gi;
const DOI_RE = /\b(?:doi[:\s]?\S+|https?:\/\/doi\.org\/\S+)/gi;
const DOI_TEST_RE = /\b(?:doi|https?:\/\/doi\.org)\b/i;
const COPYRIGHT_RE = /\b(?:copyright|©|all rights reserved|creative commons|license|CC BY)\b/i;
const PERMISSION_NOTICE_RE = /\bpermission to reproduce\b|\bjournalistic or scholarly works\b/i;
const CONTRIBUTION_NOTE_RE = /\b(?:Equal contribution|Listing order is random)\b/i;
const TOC_RE = /^(?:table of contents|contents)\b/i;
const TOC_ENTRY_RE = /^[\d.]+\s+[A-Z].*\d{1,3}$/;
const FOOTNOTE_RE = /^\d{1,2}\s+(?:[A-Z]|https?:\/\/)/;
const PAGE_NUM_RE = /^\d{1,4}$/;
const REFERENCE_HEADING_RE = /^(?:references|bibliography|works cited|citations)\s*$/i;

// Inline citation markers: (Author, 2023), (Author et al., 2023), (OpenAI, 2023), [1], [1,2], [1-3]
const INLINE_CITATION_RE = /\([A-Z][\w]+(?:\s+(?:et\s+al\.|and\s+[A-Z][\w]+))?,?\s*\d{4}[a-z]?\)/g;
const BRACKET_CITATION_RE = /\[\d{1,3}(?:[,–-]\s*\d{1,3})*\]/g;

// Affiliation blocks: "1 Faculty of..., University of..."
const AFFILIATION_BLOCK_RE = /\d\s+(?:Faculty|Department|School|Institute|College|Laboratory)\s+of\s+[^,]+,\s*[^,]+(?:,\s*[^,]+)?/gi;

// Curly-brace email blocks: {email1, email2}@domain
const BRACE_EMAIL_RE = /\{[^}]+\}@[\w.-]+\.\w{2,}/g;

/**
 * Find skippable inline spans within a paragraph.
 */
function findSkipSpans(text: string): SkipSpan[] {
  const spans: SkipSpan[] = [];

  // Emails
  for (const m of text.matchAll(EMAIL_RE)) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: "authors" });
  }

  // Brace email groups
  for (const m of text.matchAll(BRACE_EMAIL_RE)) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: "authors" });
  }

  // Affiliation blocks
  for (const m of text.matchAll(AFFILIATION_BLOCK_RE)) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: "authors" });
  }

  // arXiv IDs
  for (const m of text.matchAll(ARXIV_RE)) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: "metadata" });
  }

  // DOIs
  for (const m of text.matchAll(DOI_RE)) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: "metadata" });
  }

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
 * Calculate what fraction of the text is covered by skip spans.
 */
function spanCoverage(spans: SkipSpan[], textLength: number): number {
  if (textLength === 0) return 0;
  const covered = spans.reduce((sum, s) => sum + (s.end - s.start), 0);
  return covered / textLength;
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

  // Copyright / license notices
  if (COPYRIGHT_RE.test(trimmed) && wordCount < 40) {
    return { skip: true, reason: "boilerplate", confidence: 0.85, spans: [] };
  }

  if (PERMISSION_NOTICE_RE.test(trimmed) && wordCount < 50) {
    return { skip: true, reason: "boilerplate", confidence: 0.95, spans: [] };
  }

  if (context?.pageNumber === 1 && CONTRIBUTION_NOTE_RE.test(trimmed)) {
    return { skip: true, reason: "footnote", confidence: 0.94, spans: [] };
  }

  // Table of contents
  if (TOC_RE.test(trimmed)) {
    return { skip: true, reason: "toc", confidence: 0.9, spans: [] };
  }
  if (TOC_ENTRY_RE.test(trimmed)) {
    return { skip: true, reason: "toc", confidence: 0.8, spans: [] };
  }

  // Footnotes (short, starts with a number)
  if (FOOTNOTE_RE.test(trimmed) && wordCount < 25) {
    return { skip: true, reason: "footnote", confidence: 0.7, spans: [] };
  }

  // arXiv/DOI as standalone short paragraphs
  if (wordCount < 20 && (ARXIV_RE.test(trimmed) || DOI_TEST_RE.test(trimmed))) {
    return { skip: true, reason: "metadata", confidence: 0.85, spans: [] };
  }

  // ── Inline span detection ──

  const spans = findSkipSpans(trimmed);

  // Check for email/affiliation-heavy short blocks (whole-paragraph skip)
  const hasEmails = EMAIL_SINGLE_RE.test(trimmed);
  if (hasEmails && (AFFILIATION_RE.test(trimmed) || wordCount < 40)) {
    return { skip: true, reason: "authors", confidence: 0.9, spans: [] };
  }

  // First-page affiliation blocks
  if (context?.pageNumber === 1 && context.index <= 3) {
    if (AFFILIATION_RE.test(trimmed) && wordCount < 60) {
      const hasNumbers = /[12345]\s/.test(trimmed);
      if (hasNumbers || AUTHOR_LIST_RE.test(trimmed)) {
        return { skip: true, reason: "authors", confidence: 0.85, spans: [] };
      }
    }
  }

  // Author list at start of page 1
  if (context?.pageNumber === 1 && context.index <= 2 && AUTHOR_LIST_RE.test(trimmed) && wordCount < 30) {
    return { skip: true, reason: "authors", confidence: 0.8, spans: [] };
  }

  if (
    context?.pageNumber === 1 &&
    context.index <= 3 &&
    TITLE_AUTHOR_RE.test(trimmed) &&
    /[∗*†‡]/.test(trimmed) &&
    wordCount < 18
  ) {
    return { skip: true, reason: "authors", confidence: 0.82, spans: [] };
  }

  if (
    context?.pageNumber === 1 &&
    wordCount < 35 &&
    /(?:work performed while|conference on neural information processing systems)/i.test(trimmed)
  ) {
    return { skip: true, reason: "metadata", confidence: 0.88, spans: [] };
  }

  // If inline spans cover >80% of the text, skip the whole paragraph
  if (spans.length > 0 && spanCoverage(spans, trimmed.length) > 0.8) {
    const primaryReason = spans[0].reason;
    return { skip: true, reason: primaryReason, confidence: 0.75, spans: [] };
  }

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
  let isAfterContributionNote = false;

  return paragraphs.map((p, index) => {
    if (pageNumber === 1 && isAfterContributionNote) {
      const trimmed = p.text.trim();
      const result: ParagraphClassification = {
        skip: true,
        reason: /(?:work performed while|conference on neural information processing systems|arxiv)/i.test(trimmed)
          ? "metadata"
          : "footnote",
        confidence: 0.9,
        spans: [],
      };

      if (REFERENCE_HEADING_RE.test(trimmed)) {
        isAfterContributionNote = false;
      }

      return result;
    }

    const result = classifyParagraph(p.text, {
      pageNumber,
      index,
      total: paragraphs.length,
      isAfterReferenceHeading,
    });

    if (REFERENCE_HEADING_RE.test(p.text.trim())) {
      isAfterReferenceHeading = true;
    }

    if (pageNumber === 1 && CONTRIBUTION_NOTE_RE.test(p.text.trim())) {
      isAfterContributionNote = true;
    }

    return result;
  });
}
