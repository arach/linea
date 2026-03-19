/**
 * Heuristic paragraph classifier.
 *
 * Detects paragraphs that are typically skipped during focused reading:
 * author blocks, affiliations, references, footnotes, etc.
 */

export type SkipReason =
  | "authors"      // author names, affiliations, emails
  | "references"   // citation list items
  | "footnote"     // footnote markers or short annotation text
  | "metadata"     // dates, identifiers, copyright, page numbers
  | "toc"          // table of contents entries
  | "boilerplate"; // disclaimers, legal text

export type ParagraphClassification = {
  skip: boolean;
  reason: SkipReason | null;
  confidence: number; // 0–1, how sure we are
};

// ── patterns ──

const EMAIL_RE = /[\w.-]+@[\w.-]+\.\w{2,}/;
const AFFILIATION_RE = /\b(university|institute|department|faculty|school of|college of|laboratory|lab)\b/i;
const AUTHOR_LIST_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}(?:\s*[,&]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}){1,}/;
const NUMBERED_REF_RE = /^\[?\d{1,3}\]?\s+[A-Z][a-z]+/;
const ARXIV_RE = /\barxiv[:\s]\d{4}\.\d{4,5}/i;
const DOI_RE = /\b(?:doi|https?:\/\/doi\.org)\b/i;
const COPYRIGHT_RE = /\b(?:copyright|©|all rights reserved|creative commons|license|CC BY)\b/i;
const TOC_RE = /^(?:table of contents|contents)\b/i;
const TOC_ENTRY_RE = /^[\d.]+\s+[A-Z].*\d{1,3}$/;
const FOOTNOTE_RE = /^\d{1,2}\s+(?:[A-Z]|https?:\/\/)/;
const PAGE_NUM_RE = /^\d{1,4}$/;
const REFERENCE_HEADING_RE = /^(?:references|bibliography|works cited|citations)\s*$/i;

/**
 * Classify a single paragraph by its text content.
 * Optionally receives context: position in the page, surrounding paragraphs.
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
    return { skip: true, reason: "metadata", confidence: 0.9 };
  }

  // Reference section heading
  if (REFERENCE_HEADING_RE.test(trimmed)) {
    return { skip: true, reason: "references", confidence: 0.95 };
  }

  // After a "References" heading, everything is citations
  if (context?.isAfterReferenceHeading) {
    return { skip: true, reason: "references", confidence: 0.9 };
  }

  // Numbered reference entries: [1] Author... or 1. Author...
  if (NUMBERED_REF_RE.test(trimmed) && (DOI_RE.test(trimmed) || /\(\d{4}\)/.test(trimmed) || /pp\.\s*\d/.test(trimmed))) {
    return { skip: true, reason: "references", confidence: 0.9 };
  }

  // arXiv identifiers or DOIs as standalone paragraphs
  if (wordCount < 20 && (ARXIV_RE.test(trimmed) || DOI_RE.test(trimmed))) {
    return { skip: true, reason: "metadata", confidence: 0.85 };
  }

  // Email-heavy paragraphs (author contact blocks)
  const emailMatches = trimmed.match(new RegExp(EMAIL_RE.source, "g"));
  if (emailMatches && emailMatches.length >= 1) {
    // If it also has affiliations or is short, it's author metadata
    if (AFFILIATION_RE.test(trimmed) || wordCount < 40) {
      return { skip: true, reason: "authors", confidence: 0.9 };
    }
  }

  // Affiliation blocks (usually on first page, short, many institution names)
  if (context?.pageNumber === 1 && context.index <= 3) {
    if (AFFILIATION_RE.test(trimmed) && wordCount < 60) {
      // Check if it looks like an author + affiliation block
      const hasNumbers = /[12345]\s/.test(trimmed); // superscript-style numbers
      if (hasNumbers || AUTHOR_LIST_RE.test(trimmed)) {
        return { skip: true, reason: "authors", confidence: 0.85 };
      }
    }
  }

  // Author list at the start of page 1
  if (context?.pageNumber === 1 && context.index <= 2 && AUTHOR_LIST_RE.test(trimmed) && wordCount < 30) {
    return { skip: true, reason: "authors", confidence: 0.8 };
  }

  // Copyright / license notices
  if (COPYRIGHT_RE.test(trimmed) && wordCount < 40) {
    return { skip: true, reason: "boilerplate", confidence: 0.85 };
  }

  // Table of contents
  if (TOC_RE.test(trimmed)) {
    return { skip: true, reason: "toc", confidence: 0.9 };
  }
  if (TOC_ENTRY_RE.test(trimmed)) {
    return { skip: true, reason: "toc", confidence: 0.8 };
  }

  // Footnotes (short, starts with a number)
  if (FOOTNOTE_RE.test(trimmed) && wordCount < 25) {
    return { skip: true, reason: "footnote", confidence: 0.7 };
  }

  return { skip: false, reason: null, confidence: 0 };
}

/**
 * Classify all paragraphs on a page, passing context between them
 * so that e.g. everything after "References" gets flagged.
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

    // Track reference heading state for subsequent paragraphs
    if (REFERENCE_HEADING_RE.test(p.text.trim())) {
      isAfterReferenceHeading = true;
    }

    return result;
  });
}
