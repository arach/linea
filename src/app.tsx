import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Expand,
  Eye,
  FileUp,
  LoaderCircle,
  Lock,
  Menu,
  Moon,
  MousePointer2,
  Sun,
  Pause,
  Play,
  Quote,
  Sparkles,
  Square,
  ALargeSmall,
  AudioLines,
  Palette,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ExtractionProgress,
  ReaderDocument,
  ReaderPage,
  ReaderParagraph,
} from "@/lib/pdf";
import { getPdfModule, loadReaderDocument } from "@/lib/pdf";
import {
  defaultReaderSettings,
  type ReaderFont,
  type ReaderSettings,
  type ReaderTheme,
  readerFonts,
  readerThemes,
} from "@/lib/reader-presentation";
import { useVoiceConsole } from "@/lib/voice";
import { useTheme } from "@/lib/theme";
import { ProviderCredentials } from "@/components/provider-credentials";
import { formatCount, formatMinutes } from "@/lib/utils";

/* ─── types ─── */

type AppProps = {
  initialDocument: ReaderDocument | null;
};

/* ─── pdf renderer hook ─── */

type PdfDocumentProxy = Awaited<
  ReturnType<Awaited<ReturnType<typeof getPdfModule>>["getDocument"]>["promise"]
>;

function usePdfDocument(pdfData: Uint8Array | null) {
  const docRef = useRef<PdfDocumentProxy | null>(null);
  const [ready, setReady] = useState(false);
  const loadingDataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!pdfData) {
      docRef.current?.cleanup();
      docRef.current = null;
      setReady(false);
      return;
    }

    if (loadingDataRef.current === pdfData) return;
    loadingDataRef.current = pdfData;

    let cancelled = false;
    setReady(false);

    (async () => {
      try {
        const pdfjs = await getPdfModule();
        const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
        if (cancelled) {
          pdf.cleanup();
          return;
        }
        docRef.current?.cleanup();
        docRef.current = pdf;
        setReady(true);
      } catch {
        if (!cancelled) setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfData]);

  useEffect(() => {
    return () => {
      docRef.current?.cleanup();
      docRef.current = null;
    };
  }, []);

  return { doc: ready ? docRef.current : null, ready };
}

/* ─── pdf canvas renderer ─── */

function renderPdfPage(
  doc: PdfDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
  signal: { cancelled: boolean },
) {
  return (async () => {
    try {
      const page = await doc.getPage(pageNumber);
      if (signal.cancelled) {
        page.cleanup();
        return;
      }
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
      page.cleanup();
    } catch {
      /* page may have been cleaned up */
    }
  })();
}

function PdfThumbnail({
  doc,
  pageNumber,
  scale,
}: {
  doc: PdfDocumentProxy | null;
  pageNumber: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !doc) return;
    const signal = { cancelled: false };
    void renderPdfPage(doc, pageNumber, canvas, scale, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [doc, pageNumber, scale]);

  return <canvas ref={canvasRef} />;
}

/* ─── pdf expand overlay ─── */

function PdfExpandOverlay({
  doc,
  pageNumber,
  totalPages,
  onClose,
  onNavigate,
}: {
  doc: PdfDocumentProxy;
  pageNumber: number;
  totalPages: number;
  onClose: () => void;
  onNavigate: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signal = { cancelled: false };
    void renderPdfPage(doc, pageNumber, canvas, 2, signal);
    return () => { signal.cancelled = true; };
  }, [doc, pageNumber]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && pageNumber > 1) onNavigate(pageNumber - 1);
      if (e.key === "ArrowRight" && pageNumber < totalPages) onNavigate(pageNumber + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onNavigate, pageNumber, totalPages]);

  return (
    <div className="pdf-overlay" onClick={onClose}>
      <div className="pdf-overlay-content" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-overlay-header">
          <div className="pdf-overlay-nav">
            <button
              type="button"
              className="linea-btn-secondary linea-btn-icon"
              onClick={() => onNavigate(Math.max(1, pageNumber - 1))}
              disabled={pageNumber === 1}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="linea-panel-label">
              Page {pageNumber} of {totalPages}
            </span>
            <button
              type="button"
              className="linea-btn-secondary linea-btn-icon"
              onClick={() => onNavigate(Math.min(totalPages, pageNumber + 1))}
              disabled={pageNumber === totalPages}
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <button
            type="button"
            className="linea-btn-ghost linea-btn-icon"
            onClick={onClose}
          >
            <X size={16} />
            Close
          </button>
        </div>
        <div className="pdf-overlay-canvas">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}

/* ─── pdf minimap sidebar ─── */

function PdfSidebar({
  doc,
  document,
  selectedPage,
  onSelectPage,
  onExpand,
}: {
  doc: PdfDocumentProxy | null;
  document: ReaderDocument;
  selectedPage: number;
  onSelectPage: (page: number) => void;
  onExpand: (page: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    const container = containerRef.current;
    const activePage = pageRefs.current.get(selectedPage);
    if (!container || !activePage) return;

    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const pageTop = activePage.offsetTop - 8;
    const pageBottom = pageTop + activePage.offsetHeight + 16;

    if (pageTop < containerTop) {
      container.scrollTo({ top: pageTop, behavior: "smooth" });
      return;
    }

    if (pageBottom > containerBottom) {
      container.scrollTo({
        top: pageBottom - container.clientHeight,
        behavior: "smooth",
      });
    }
  }, [selectedPage]);

  if (!doc) {
    return (
      <nav className="linea-pdf-sidebar">
        <div className="pdf-sidebar-header">
          <div>
            <span className="linea-panel-label">Document Map</span>
            <div className="linea-panel-value">Pages</div>
          </div>
        </div>
        <div className="pdf-thumbnail-list">
          {document.pages.map((page) => {
            const isActive = page.pageNumber === selectedPage;
            return (
              <button
                key={page.pageNumber}
                type="button"
                className={`pdf-thumbnail-card${isActive ? " active" : ""}`}
                onClick={() => onSelectPage(page.pageNumber)}
              >
                <div className="pdf-thumbnail-frame placeholder">
                  <span className="pdf-thumbnail-page">Page {page.pageNumber}</span>
                </div>
                <div className="pdf-thumbnail-meta">
                  <div className="pdf-thumbnail-title">{page.title}</div>
                  <div className="pdf-thumbnail-stats">
                    <span>{page.wordCount ? `${formatCount(page.wordCount)} words` : "No text layer"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="linea-pdf-sidebar">
      <div className="pdf-sidebar-header">
        <span className="pdf-sidebar-doctitle">{document.fileName}</span>
      </div>
      <div className="pdf-sidebar-header">
        <span className="linea-panel-label">Pages</span>
        <span className="linea-panel-label">{selectedPage} / {document.pageCount}</span>
      </div>
      <div className="pdf-thumbnail-list" ref={containerRef}>
        {document.pages.map((page) => {
          const isActive = page.pageNumber === selectedPage;

          return (
            <button
              key={page.pageNumber}
              ref={(node) => {
                if (node) {
                  pageRefs.current.set(page.pageNumber, node);
                } else {
                  pageRefs.current.delete(page.pageNumber);
                }
              }}
              type="button"
              className={`pdf-thumbnail-card${isActive ? " active" : ""}`}
              onClick={() => {
                if (isActive) {
                  onExpand(page.pageNumber);
                  return;
                }
                onSelectPage(page.pageNumber);
              }}
            >
              <div className="pdf-thumbnail-toolbar">
                <span className="pdf-thumbnail-badge">{page.pageNumber}</span>
                <span className="pdf-thumbnail-badge">
                  {page.wordCount ? `${formatCount(page.wordCount)}w` : "No text"}
                </span>
              </div>

              <div className="pdf-thumbnail-frame">
                <PdfThumbnail doc={doc} pageNumber={page.pageNumber} scale={0.22} />
              </div>

              <div className="pdf-thumbnail-meta">
                <div className="pdf-thumbnail-title">{page.title}</div>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function describeVoice(voice: { locale?: string; tags?: string[]; previewText?: string }) {
  if (voice.tags?.length) {
    return voice.tags.slice(0, 2).join(" / ");
  }

  if (voice.locale) {
    return voice.locale.replace("-", " ");
  }

  if (voice.previewText) {
    return "Preview available";
  }

  return "Selectable voice";
}

function formatDurationMs(value: number) {
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function tokenizeParagraph(text: string) {
  return Array.from(text.matchAll(/\S+|\s+/g)).map((match) => ({
    value: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    isWhitespace: /^\s+$/.test(match[0]),
  }));
}

function findActiveTokenIndex(tokens: ReturnType<typeof tokenizeParagraph>, relativeCharIndex: number) {
  if (relativeCharIndex < 0) {
    return -1;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (relativeCharIndex < token.end) {
      if (!token.isWhitespace) {
        return index;
      }

      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (!tokens[cursor].isWhitespace) {
          return cursor;
        }
      }

      return -1;
    }
  }

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!tokens[index].isWhitespace) {
      return index;
    }
  }

  return -1;
}

function renderDimSpans(paragraph: ReaderParagraph) {
  const spans = paragraph.dimSpans;
  if (!spans || spans.length === 0) return paragraph.text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s.start > cursor) {
      parts.push(paragraph.text.slice(cursor, s.start));
    }
    parts.push(
      <span key={`dim-${paragraph.id}-${i}`} className="linea-dim-span">
        {paragraph.text.slice(s.start, s.end)}
      </span>,
    );
    cursor = s.end;
  }
  if (cursor < paragraph.text.length) {
    parts.push(paragraph.text.slice(cursor));
  }
  return parts;
}

function renderParagraphText(paragraph: ReaderParagraph, absoluteCharIndex: number | null) {
  if (absoluteCharIndex === null) {
    return renderDimSpans(paragraph);
  }

  const relativeCharIndex = absoluteCharIndex - paragraph.start;
  if (relativeCharIndex < 0 || relativeCharIndex > paragraph.text.length) {
    return renderDimSpans(paragraph);
  }

  const tokens = tokenizeParagraph(paragraph.text);
  const activeTokenIndex = findActiveTokenIndex(tokens, relativeCharIndex);

  if (activeTokenIndex < 0) {
    return renderDimSpans(paragraph);
  }

  const dimSpans = paragraph.dimSpans ?? [];

  return tokens.map((token, index) => {
    if (token.isWhitespace) {
      return token.value;
    }

    const isDimmed = dimSpans.some((s) => token.start >= s.start && token.end <= s.end);
    const isHighlighted = index === activeTokenIndex;

    return (
      <span
        key={`${paragraph.id}:${token.start}`}
        className={
          isHighlighted ? "linea-word-highlight" : isDimmed ? "linea-dim-span" : undefined
        }
      >
        {token.value}
      </span>
    );
  });
}

/* ─── context panel ─── */

function snippetText(text: string, maxLen = 80) {
  if (text.length <= maxLen) return text;
  const half = Math.floor((maxLen - 3) / 2);
  return `${text.slice(0, half).trimEnd()}...${text.slice(-half).trimStart()}`;
}

function ContextPanel({
  document,
  page,
  voice,
  selectedParagraph,
  selectedParagraphId,
  selectedPage,
  onSelectParagraph,
}: {
  document: ReaderDocument;
  page: ReaderPage;
  voice: ReturnType<typeof useVoiceConsole>;
  selectedParagraph: ReaderParagraph | null;
  selectedParagraphId: string | null;
  selectedPage: number;
  onSelectParagraph: (id: string | null) => void;
}) {
  const activeParagraph = useMemo(
    () => voice.activeParagraphId
      ? page.paragraphs.find((p) => p.id === voice.activeParagraphId) ?? null
      : null,
    [page.paragraphs, voice.activeParagraphId],
  );

  const isPlaying = voice.isSpeaking || voice.isPaused || voice.activity.phase === "requesting";

  const visibleParagraphs = useMemo(
    () => page.paragraphs.filter((p) => p.text.trim() !== page.title.trim()),
    [page.paragraphs, page.title],
  );

  return (
    <aside className="linea-context-panel">
      <div className="linea-panel-section">
        <div className="context-page-header">
          <span className="linea-panel-label">Page {page.pageNumber} / {document.pageCount}</span>
        </div>
        <div className="context-stats">
          <div>
            <span className="linea-panel-label">Page</span>
            <span className="linea-panel-value">{formatCount(page.wordCount)}</span>
          </div>
          <div>
            <span className="linea-panel-label">Total</span>
            <span className="linea-panel-value">{formatCount(document.totalWords)}</span>
          </div>
          <div>
            <span className="linea-panel-label">Listen</span>
            <span className="linea-panel-value">{formatMinutes(document.estimatedMinutes)}</span>
          </div>
        </div>
      </div>

      {/* Active content (playing) */}
      {isPlaying && (
        <div className="linea-panel-section">
          <span className="linea-panel-label linea-label-active">Active</span>
          {activeParagraph && (
            <>
              <div className="linea-context-snippet">
                {snippetText(activeParagraph.text)}
              </div>
              <span className="linea-panel-label">
                {activeParagraph.text.split(/\s+/).filter(Boolean).length} words
              </span>
            </>
          )}
          {voice.activity.phase === "requesting" && (
            <div className="linea-player-meta">
              <LoaderCircle size={12} className="animate-spin" />
              <span>{voice.activity.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Selected content (user-clicked paragraph) */}
      {selectedParagraph && !isPlaying && (
        <div className="linea-panel-section">
          <span className="linea-panel-label">Selected</span>
          <div className="linea-context-snippet">
            {snippetText(selectedParagraph.text)}
          </div>
          <span className="linea-panel-label">
            {selectedParagraph.text.split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
      )}

      {/* Paragraph outline */}
      <div className="linea-panel-section context-outline-section">
        <span className="linea-panel-label">Outline · {visibleParagraphs.length} paragraphs</span>
        <div className="context-outline">
          {visibleParagraphs.map((p, i) => {
            const wc = p.text.split(/\s+/).filter(Boolean).length;
            const isActive = voice.activeParagraphId === p.id;
            const isSelected = selectedParagraphId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`context-outline-item${isActive ? " active" : ""}${isSelected ? " selected" : ""}${p.skip ? " dimmed" : ""}`}
                onClick={() => {
                  onSelectParagraph(selectedParagraphId === p.id ? null : p.id);
                  const el = window.document.querySelector(`[data-paragraph-id="${p.id}"]`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <span className="context-outline-num">{i + 1}</span>
                <span className="context-outline-text">{p.skip ? `${p.skip.reason} · ${snippetText(p.text, 36)}` : snippetText(p.text, 50)}</span>
                <span className="context-outline-wc">{wc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

/* ─── header ─── */

function HeaderPopover({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className="linea-header-popover">
      {children}
    </div>
  );
}

function ApiKeySetupModal({
  open,
  onClose,
  onCredentialsChanged,
}: {
  open: boolean;
  onClose: () => void;
  onCredentialsChanged: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="linea-modal-backdrop" onClick={onClose}>
      <div
        className="linea-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-api-key-setup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="linea-modal-header">
          <div>
            <span className="linea-panel-label">Voice setup</span>
            <h3 id="voice-api-key-setup-title" className="linea-modal-title">
              Connect voice providers
            </h3>
          </div>
          <button
            type="button"
            className="linea-btn-ghost linea-btn-icon"
            onClick={onClose}
            aria-label="Close API key setup"
          >
            <X size={14} />
          </button>
        </div>
        <p className="linea-modal-copy">
          Add API keys for OpenAI and ElevenLabs to enable voice playback. Keys are stored in your
          operating system secure credential store.
        </p>
        <ProviderCredentials variant="plain" onCredentialsChanged={onCredentialsChanged} />
      </div>
    </div>,
    document.body,
  );
}

const SAMPLE_DOCUMENTS = [
  { file: "whitepaper.pdf", label: "White Paper", description: "AI research paper" },
  { file: "article.pdf", label: "Press Release", description: "Earnings report" },
  { file: "book.pdf", label: "Book", description: "Full-length book" },
] as const;

function Header({
  document,
  onUploadClick,
  onLoadSample,
  loadingSample,
  theme,
  toggleTheme,
  settings,
  onSettingsChange,
  voice,
  documentProgress,
}: {
  document: ReaderDocument | null;
  onUploadClick: () => void;
  onLoadSample: (file: string, label: string) => void;
  loadingSample: string | null;
  theme: string;
  toggleTheme: () => void;
  settings: ReaderSettings;
  onSettingsChange: (s: ReaderSettings) => void;
  voice: ReturnType<typeof useVoiceConsole>;
  documentProgress: number;
}) {
  const [openPopover, setOpenPopover] = useState<"typography" | "theme" | "voice" | "library" | null>(null);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const togglePopover = (key: "typography" | "theme" | "voice" | "library") =>
    setOpenPopover((prev) => (prev === key ? null : key));
  const update = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) =>
    onSettingsChange({ ...settings, [key]: value });
  const hasAvailableVoiceProvider = voice.providers.some((provider) => provider.available);
  const shouldOpenVoiceSetupModal = voice.providers.length > 0 && !hasAvailableVoiceProvider;

  useEffect(() => {
    if (openPopover === "voice" && shouldOpenVoiceSetupModal) {
      setOpenPopover(null);
      setApiKeyModalOpen(true);
    }
  }, [openPopover, shouldOpenVoiceSetupModal]);

  return (
    <header className="linea-header">
      <div className="wrap-wide">
        <div className="linea-header-brand">
          <span className="linea-logo">Linea</span>
          {document && <span className="linea-header-sub">Reader</span>}
        </div>
        <nav className="linea-nav">
          {document && (
            <>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="linea-btn-ghost linea-btn-icon"
                  onClick={() => togglePopover("typography")}
                  aria-label="Typography settings"
                >
                  <ALargeSmall size={14} />
                </button>
                <HeaderPopover open={openPopover === "typography"} onClose={() => setOpenPopover(null)}>
                  <span className="linea-panel-label">Font</span>
                  <div className="linea-setting-row" style={{ marginTop: 6 }}>
                    {(Object.entries(readerFonts) as [ReaderFont, (typeof readerFonts)[ReaderFont]][]).map(
                      ([key, meta]) => (
                        <button
                          key={key}
                          type="button"
                          className={`linea-chip${settings.font === key ? " active" : ""}`}
                          onClick={() => update("font", key)}
                        >
                          {meta.label}
                        </button>
                      ),
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                    <span className="linea-panel-label">Size</span>
                    <span className="linea-panel-label">{settings.fontSize}px</span>
                  </div>
                  <input
                    type="range" min={16} max={30} step={1}
                    value={settings.fontSize}
                    onChange={(e) => update("fontSize", Number(e.target.value))}
                    className="linea-slider"
                  />
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="linea-panel-label">Line height</span>
                    <span className="linea-panel-label">{settings.lineHeight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min={1.4} max={2} step={0.02}
                    value={settings.lineHeight}
                    onChange={(e) => update("lineHeight", Number(e.target.value))}
                    className="linea-slider"
                  />
                </HeaderPopover>
              </div>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="linea-btn-ghost linea-btn-icon"
                  onClick={() => togglePopover("theme")}
                  aria-label="Theme settings"
                >
                  <Palette size={14} />
                </button>
                <HeaderPopover open={openPopover === "theme"} onClose={() => setOpenPopover(null)}>
                  <span className="linea-panel-label">Reader Theme</span>
                  <div className="linea-setting-row" style={{ marginTop: 6 }}>
                    {(Object.entries(readerThemes) as [ReaderTheme, (typeof readerThemes)[ReaderTheme]][]).map(
                      ([key, meta]) => (
                        <button
                          key={key}
                          type="button"
                          className={`linea-chip${settings.theme === key ? " active" : ""}`}
                          onClick={() => update("theme", key)}
                        >
                          {meta.label}
                        </button>
                      ),
                    )}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span className="linea-panel-label">Mode</span>
                    <div className="linea-setting-row" style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className={`linea-chip${theme === "light" ? " active" : ""}`}
                        onClick={() => { if (theme === "dark") toggleTheme(); }}
                      >
                        <Sun size={12} /> Light
                      </button>
                      <button
                        type="button"
                        className={`linea-chip${theme === "dark" ? " active" : ""}`}
                        onClick={() => { if (theme === "light") toggleTheme(); }}
                      >
                        <Moon size={12} /> Dark
                      </button>
                    </div>
                  </div>
                </HeaderPopover>
              </div>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="linea-btn-ghost linea-btn-icon"
                  onClick={() => {
                    if (shouldOpenVoiceSetupModal) {
                      setApiKeyModalOpen(true);
                      setOpenPopover(null);
                      return;
                    }

                    togglePopover("voice");
                  }}
                  aria-label="Voice settings"
                >
                  <AudioLines size={14} />
                </button>
                <HeaderPopover open={openPopover === "voice"} onClose={() => setOpenPopover(null)}>
                  {voice.providers.length > 0 ? (
                    <>
                      <div className="voice-provider-tabs">
                        {voice.providers.map((provider) => (
                          <button
                            key={provider.id}
                            type="button"
                            className={`voice-provider-tab${voice.selectedProvider === provider.id ? " active" : ""}${provider.available ? "" : " unavailable"}`}
                            onClick={() => voice.setSelectedProvider(provider.id)}
                            disabled={!provider.available && voice.providers.some((e) => e.available)}
                          >
                            <span>{provider.label}</span>
                            <span className="voice-provider-count">{voice.selectedProvider === provider.id ? voice.voices.length : "..."}</span>
                          </button>
                        ))}
                      </div>
                      {voice.loadingVoices ? (
                        <div className="linea-status">Loading voices...</div>
                      ) : voice.voices.length > 0 ? (
                        <div className="voice-card-grid voice-card-grid-compact">
                          {voice.voices.map((entry) => (
                            <button
                              key={`${entry.provider}:${entry.id}`}
                              type="button"
                              className={`voice-card${entry.id === voice.selectedVoice ? " active" : ""}`}
                              onClick={() => voice.setSelectedVoice(entry.id)}
                            >
                              <span className="voice-card-name">{entry.label}</span>
                              <span className="voice-card-meta">{describeVoice(entry)}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="linea-status">No voices available yet.</div>
                      )}
                    </>
                  ) : (
                    <div className="linea-status">No voice providers available.</div>
                  )}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="linea-panel-label">Rate</span>
                      <span className="linea-panel-label">{voice.rate.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range" min={0.7} max={1.4} step={0.1}
                      value={voice.rate}
                      onChange={(e) => voice.setRate(Number(e.target.value))}
                      className="linea-slider"
                    />
                  </div>
                  <button
                    type="button"
                    className="linea-btn-secondary"
                    onClick={() => setApiKeyModalOpen(true)}
                  >
                    Manage API keys
                  </button>
                </HeaderPopover>
              </div>
            </>
          )}
          {document ? (
            <>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="linea-btn-ghost linea-btn-icon"
                  onClick={() => togglePopover("library")}
                  aria-label="Sample documents"
                >
                  <BookOpen size={14} />
                </button>
                <HeaderPopover open={openPopover === "library"} onClose={() => setOpenPopover(null)}>
                  <span className="linea-panel-label">Sample Documents</span>
                  <div className="sample-doc-list">
                    {SAMPLE_DOCUMENTS.map((sample) => (
                      <button
                        key={sample.file}
                        type="button"
                        className={`sample-doc-item${document?.fileName === sample.label + ".pdf" || document?.fileName === sample.file ? " active" : ""}`}
                        disabled={loadingSample !== null}
                        onClick={() => {
                          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                          onLoadSample(`${base}/samples/${sample.file}`, sample.label);
                          setOpenPopover(null);
                        }}
                      >
                        <span className="sample-doc-label">{sample.label}</span>
                        <span className="sample-doc-desc">{sample.description}</span>
                        {loadingSample === sample.label && (
                          <LoaderCircle size={12} className="animate-spin" style={{ color: "var(--accent)" }} />
                        )}
                      </button>
                    ))}
                  </div>
                </HeaderPopover>
              </div>
              <button
                type="button"
                className="linea-btn-secondary linea-btn-icon"
                onClick={onUploadClick}
              >
                <Upload size={14} />
                Open PDF
              </button>
            </>
          ) : (
            <a href={`${import.meta.env.BASE_URL}playground`}>Sample Document</a>
          )}
        </nav>
      </div>
      <ApiKeySetupModal
        open={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onCredentialsChanged={() => void voice.refreshProviders()}
      />
      {document && (
        <div className="linea-doc-progress-strip">
          <div className="linea-progress-fill" style={{ width: `${documentProgress * 100}%` }} />
        </div>
      )}
    </header>
  );
}

function RequestStageGlyph({ phaseIndex }: { phaseIndex: number }) {
  return (
    <div className="linea-request-glyph" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => {
        const active = index <= phaseIndex + 1 && index >= phaseIndex - 1;
        return <span key={index} className={active ? "active" : ""} />;
      })}
    </div>
  );
}

/* ─── command bar ─── */

function CommandBar({
  document,
  page,
  selectedPage,
  selectedParagraph,
  isSpeaking,
  isPaused,
  activePageNumber,
  activeParagraphId,
  hasSelection,
  downloadUrl,
  onPlay,
  onCancelRequest,
  onPauseOrResume,
  onStop,
  onReadSelection,
  isRequesting,
  clipProgress,
  clipElapsedMs,
  clipDurationMs,
  clipCurrentWord,
  clipTotalWords,
  onSeekClip,
}: {
  document: ReaderDocument;
  page: ReaderPage;
  selectedPage: number;
  selectedParagraph: ReaderParagraph | null;
  isSpeaking: boolean;
  isPaused: boolean;
  activePageNumber: number | null;
  activeParagraphId: string | null;
  hasSelection: boolean;
  downloadUrl: string | null;
  onPlay: () => void;
  onCancelRequest: () => void;
  onPauseOrResume: () => void;
  onStop: () => void;
  onReadSelection: () => void;
  isRequesting: boolean;
  clipProgress: number;
  clipElapsedMs: number;
  clipDurationMs: number;
  clipCurrentWord: number;
  clipTotalWords: number;
  onSeekClip: (progress: number) => void;
}) {
  const wordCount = selectedParagraph
    ? selectedParagraph.text.split(/\s+/).filter(Boolean).length
    : page.wordCount;
  const [requestPhaseIndex, setRequestPhaseIndex] = useState(0);

  useEffect(() => {
    if (!isRequesting) {
      setRequestPhaseIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setRequestPhaseIndex((current) => (current + 1) % 3);
    }, 1200);

    return () => window.clearInterval(interval);
  }, [isRequesting]);

  const requestPhaseLabels = ["Requesting", "Processing", "Downloading"];
  const requestPhaseLabel = requestPhaseLabels[requestPhaseIndex];
  const canSeek = clipDurationMs > 0 && !isRequesting;

  // Derive a short context label: "P1 ¶3" style
  const activeParaNum = activeParagraphId?.match(/paragraph-(\d+)/)?.[1];
  const contextLabel = (isSpeaking || isPaused)
    ? `P${activePageNumber ?? selectedPage}${activeParaNum ? ` ¶${activeParaNum}` : ""}`
    : selectedParagraph
      ? `P${selectedPage} ¶${selectedParagraph.id.match(/paragraph-(\d+)/)?.[1] ?? ""}`
      : `P${selectedPage}`;

  const isActive = isSpeaking || isPaused || clipDurationMs > 0;

  return (
    <div className="linea-command-bar">
      <div className="linea-command-top">
        <span className="linea-command-meta">
          {contextLabel} · {formatCount(wordCount)} words
        </span>

        {/* Playback slider — inline when active */}
        {isActive && (
          <div className="linea-command-slider">
            <div className="linea-playback-slider-wrap">
              <input
                type="range"
                min={0}
                max={1000}
                step={1}
                value={Math.round(clipProgress * 1000)}
                onChange={(event) => onSeekClip(Number(event.target.value) / 1000)}
                className="linea-playback-slider"
                disabled={!canSeek}
                aria-label="Playback position"
              />
              <div className="linea-playback-slider-track">
                <div
                  className="linea-playback-slider-fill"
                  style={{ width: `${clipProgress * 100}%` }}
                />
              </div>
            </div>
            <span className="linea-command-time">
              {formatDurationMs(clipElapsedMs)} / {formatDurationMs(clipDurationMs)}
            </span>
          </div>
        )}

        {isRequesting && (
          <div className="linea-command-requesting">
            <RequestStageGlyph phaseIndex={requestPhaseIndex} />
            <span className="linea-command-meta">{requestPhaseLabel}</span>
          </div>
        )}

        <div className="linea-command-actions">
          {/* Unified play/pause/stop button */}
          <button
            type="button"
            className="linea-btn-secondary linea-btn-icon"
            onClick={isSpeaking ? onPauseOrResume : isPaused ? onPauseOrResume : onPlay}
          >
            {isSpeaking && !isPaused ? <Pause size={14} /> : isPaused ? <Play size={14} /> : <Play size={14} />}
            {isSpeaking && !isPaused ? "Pause" : isPaused ? "Resume" : "Play"}
          </button>
          {(isSpeaking || isPaused) && (
            <button
              type="button"
              className="linea-btn-secondary linea-btn-icon"
              onClick={onStop}
            >
              <Square size={14} /> Stop
            </button>
          )}
          {hasSelection && (
            <button type="button" className="linea-btn-secondary linea-btn-icon" onClick={onReadSelection}>
              <BookOpen size={14} /> Selection
            </button>
          )}
          {isRequesting && (
            <button type="button" className="linea-btn-secondary linea-btn-icon" onClick={onCancelRequest}>
              <X size={14} /> Cancel
            </button>
          )}
          {downloadUrl && (
            <a href={downloadUrl} download className="linea-btn-secondary linea-btn-icon">
              <Upload size={14} /> Save audio
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── dropzone ─── */

function Dropzone({
  onFile,
  loading,
  progress,
}: {
  onFile: (file: File) => void;
  loading: boolean;
  progress: ExtractionProgress | null;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || file.type !== "application/pdf") return;
    onFile(file);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        className={`linea-dropzone${isDragging ? " dragging" : ""}`}
      >
        <div className="linea-dropzone-icon">
          {loading ? <LoaderCircle className="animate-spin" /> : <FileUp />}
        </div>
        <h3>{loading ? "Opening your PDF locally" : "Bring in a PDF"}</h3>
        <p>
          {loading
            ? progress?.totalPages
              ? `Extracting text from ${progress.loadedPages} of ${progress.totalPages} pages.`
              : "Initializing PDF.js..."
            : "Open it in a quieter reading space. Nothing is uploaded."}
        </p>
        {!loading && (
          <span className="linea-btn" style={{ marginTop: 20 }}>Choose PDF</span>
        )}
        {loading && progress?.totalPages && (
          <div className="linea-dropzone-progress">
            {Math.round((progress.loadedPages / progress.totalPages) * 100)}% extracted
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </>
  );
}

/* ─── landing components ─── */

function LandingValueProp({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ size: number; className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-3.5 border-t border-ink/8 pt-4 first:border-t-0 first:pt-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-ink/8 bg-bg/92 shadow-[0_10px_24px_-20px_rgba(0,0,0,0.25)] transition-colors group-hover:bg-accent/4">
        <Icon size={18} className="text-accent" />
      </div>
      <div className="space-y-1.5">
        <h4 className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-ink/88">{title}</h4>
        <p className="max-w-[26ch] text-[12px] leading-[1.65] text-ink/62">{desc}</p>
      </div>
    </div>
  );
}

function LandingReaderPreview() {
  return (
    <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-[20px] border border-black/8 bg-white shadow-[0_28px_70px_-46px_rgba(0,0,0,0.42)]">
      <div className="absolute inset-0 flex flex-col">
        <div className="flex h-10 items-center justify-between border-b border-black/8 bg-[#f4efe8]/88 px-4 backdrop-blur-sm">
          <div className="flex gap-1.5">
            <div className="h-2 w-2 rounded-sm bg-black/12" />
            <div className="h-2 w-2 rounded-sm bg-black/12" />
            <div className="h-2 w-2 rounded-sm bg-black/12" />
          </div>
          <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-ink/42">The_Art_of_Focus.pdf</div>
          <div className="flex items-center gap-3">
            <div className="h-4 w-px bg-black/8" />
            <Menu size={12} className="text-ink/42" />
          </div>
        </div>
        <div className="flex flex-1 gap-7 overflow-hidden bg-[linear-gradient(180deg,#fcfaf7_0%,#f4eee7_100%)] p-7">
          <div className="w-28 space-y-3 pt-11 opacity-50 transition-opacity duration-700 group-hover:opacity-100">
            <div className="h-1.5 w-full rounded-sm bg-black/7" />
            <div className="h-1.5 w-2/3 rounded-sm bg-black/7" />
            <div className="space-y-2 pt-4">
              <div className="h-1.5 w-full rounded-sm bg-accent/11" />
              <div className="h-1.5 w-full rounded-sm bg-accent/11" />
            </div>
          </div>
          <div className="mx-auto flex-1 max-w-md space-y-5 pt-4">
            <div className="space-y-2.5">
              <div className="h-2.5 w-full rounded-sm bg-black/7" />
              <div className="h-2.5 w-full rounded-sm bg-black/7" />
              <div className="h-2.5 w-4/5 rounded-sm bg-black/7" />
            </div>
            <div className="relative py-4">
              <div className="absolute inset-y-0 -inset-x-4 rounded-[14px] border border-accent/12 bg-accent/5" />
              <div className="relative space-y-2.5">
                <div className="h-2.5 w-full rounded-sm bg-ink/82" />
                <div className="h-2.5 w-full rounded-sm bg-ink/82" />
                <div className="h-2.5 w-3/4 rounded-sm bg-ink/82" />
              </div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute -right-11 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-[12px] border border-black/8 bg-white px-2.5 py-2 shadow-[0_18px_32px_-24px_rgba(0,0,0,0.35)]"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-[6px] bg-accent/20">
                  <Sparkles size={10} className="text-accent" />
                </div>
                <div className="h-1.5 w-14 rounded-sm bg-black/7" />
              </motion.div>
            </div>
            <div className="space-y-2.5 opacity-25">
              <div className="h-2.5 w-full rounded-sm bg-black/7" />
              <div className="h-2.5 w-full rounded-sm bg-black/7" />
              <div className="h-2.5 w-2/3 rounded-sm bg-black/7" />
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(212,115,74,0.06),transparent_42%)]" />
    </div>
  );
}

/* ─── landing ─── */

function Landing({
  onFile,
  loading,
  progress,
  error,
  theme,
  toggleTheme,
}: {
  onFile: (file: File) => void;
  loading: boolean;
  progress: ExtractionProgress | null;
  error: string;
  theme: string;
  toggleTheme: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.relatedTarget === null) setIsDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file?.type === "application/pdf") onFile(file);
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onFile]);

  return (
    <div className="min-h-screen bg-bg selection:bg-accent/20 selection:text-ink">
      {/* Full-page drop overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-md flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-5 rounded-[22px] border-2 border-dashed border-accent bg-white/50 p-12 shadow-[0_40px_80px_-52px_rgba(0,0,0,0.45)]">
              <div className="flex h-18 w-18 items-center justify-center rounded-[18px] bg-accent/10">
                <Upload size={40} className="text-accent" />
              </div>
              <div className="text-center">
                <h3 className="mb-2 text-2xl font-serif tracking-[-0.03em] text-ink">Drop your PDF anywhere</h3>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/56">Processing remains local</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file?.type === "application/pdf") onFile(file);
        }}
      />

      {/* Navigation */}
      <nav className="border-b border-ink/8 px-6 py-5 md:px-8">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-[0.28em] text-ink pl-2">Linea</div>
          <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-[0.16em] text-ink/48">
            <a href={`${import.meta.env.BASE_URL}playground`} className="transition-colors hover:text-ink">Demo</a>
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-full transition-colors hover:bg-ink/5"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1240px] px-6 pb-28 pt-12 md:px-8 md:pt-16">
        <div className="flex flex-col gap-18 md:gap-20">
          {error && <div className="linea-error">{error}</div>}

          {/* Hero */}
          <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="space-y-8 md:space-y-9"
            >
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-[10px] border border-accent/10 bg-accent/8 px-3 py-1.5">
                  <Sparkles size={12} className="text-accent" />
                  <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.18em] text-accent">New: AI-Powered Context</span>
                </div>
                <h1 className="max-w-[14ch] font-serif text-[3.75rem] leading-[0.9] tracking-[-0.055em] text-ink md:text-[5.2rem] lg:text-[5.85rem]">
                  A workspace for <span className="italic">deep reading.</span>
                </h1>
                <p className="max-w-[30rem] text-[1rem] leading-[1.9] text-ink/66 md:text-[1.06rem]">
                  Traditional PDF readers are built for forms and printing. Linea is built for{" "}
                  <span className="font-medium text-ink">understanding</span>: a calmer surface for
                  staying with difficult material instead of fighting the interface.
                </p>
              </div>

              <div className="flex flex-col gap-3.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={loading}
                  className="group flex items-center justify-center gap-2.5 rounded-full bg-accent px-7 py-2.5 text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-white shadow-xl shadow-accent/20 transition-all hover:brightness-110 disabled:opacity-50 sm:px-8 sm:py-3"
                >
                  <Upload size={16} className="group-hover:-translate-y-0.5 transition-transform" />
                  {loading ? "Opening..." : "Open a PDF"}
                </button>
                <a
                  href={`${import.meta.env.BASE_URL}playground`}
                  className={`flex items-center justify-center gap-2 rounded-full border border-ink/30 px-7 py-2.5 text-[9px] font-mono font-semibold uppercase tracking-[0.17em] text-ink transition-all hover:bg-ink/5 sm:px-8 sm:py-3${loading ? " pointer-events-none opacity-50" : ""}`}
                >
                  View Demo
                </a>
              </div>

              {loading && progress?.totalPages && (
                <div className="flex items-center gap-3">
                  <LoaderCircle size={16} className="animate-spin text-accent" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink/54">
                    Extracting page {progress.loadedPages} of {progress.totalPages}
                  </span>
                </div>
              )}

            </motion.div>

            {/* Preview + value props */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="relative lg:translate-x-10 lg:-translate-y-2"
            >
              <div className="relative z-10">
                <LandingReaderPreview />

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1, duration: 0.8 }}
                  className="absolute -right-6 top-[22%] hidden max-w-[168px] rounded-[16px] border border-black/8 bg-white px-4 py-3.5 shadow-[0_24px_44px_-30px_rgba(0,0,0,0.38)] xl:block"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-sm bg-accent animate-pulse" />
                    <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/78">Active Focus</span>
                  </div>
                  <p className="text-[11px] leading-[1.55] text-ink/58">
                    The focused lane automatically tracks your reading pace.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.4, duration: 0.8 }}
                  className="absolute -left-4 bottom-[22%] hidden max-w-[168px] rounded-[16px] border border-black/8 bg-white px-4 py-3.5 shadow-[0_24px_44px_-30px_rgba(0,0,0,0.38)] xl:block"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles size={12} className="text-accent" />
                    <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/78">Quiet Help</span>
                  </div>
                  <p className="text-[11px] leading-[1.55] text-ink/58">
                    Definitions and translations appear in the margin, never over the text.
                  </p>
                </motion.div>
              </div>

              <div className="absolute -right-14 -top-10 h-72 w-72 rounded-full bg-accent/4 blur-[96px]" />
              <div className="absolute -bottom-12 -left-8 h-72 w-72 rounded-full bg-accent/4 blur-[96px]" />

              <div className="grid grid-cols-2 gap-x-8 gap-y-5 pt-10 lg:-translate-x-10">
                <LandingValueProp
                  icon={Zap}
                  title="Focused Lane"
                  desc="A visual guide that keeps your eyes on the current passage, reducing fatigue."
                />
                <LandingValueProp
                  icon={MousePointer2}
                  title="Instant Context"
                  desc="Click any term for AI-powered explanations without breaking your flow."
                />
                <LandingValueProp
                  icon={Lock}
                  title="Local Privacy"
                  desc="Documents are processed entirely in your browser. No server uploads."
                />
                <LandingValueProp
                  icon={Eye}
                  title="Visual Comfort"
                  desc="Optimized typography and spacing designed for long-form immersion."
                />
              </div>
            </motion.div>
          </div>

          {/* Secondary story */}
          <div className="grid grid-cols-1 gap-10 border-t border-ink/8 pt-14 md:grid-cols-3 md:gap-8">
            <div className="space-y-3">
              <h3 className="font-serif text-[1.4rem] leading-[1.05] tracking-[-0.03em] text-ink">Sustain concentration.</h3>
              <p className="max-w-[26ch] text-[13px] leading-6 text-ink/62">
                Linea tracks your position and dims surrounding text so you stay anchored in
                the paragraph you're actually reading.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="font-serif text-[1.4rem] leading-[1.05] tracking-[-0.03em] text-ink">Look up, not away.</h3>
              <p className="max-w-[26ch] text-[13px] leading-6 text-ink/62">
                Definitions and context surface beside the text. No tab switching, no
                copy-pasting into a search bar.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="font-serif text-[1.4rem] leading-[1.05] tracking-[-0.03em] text-ink">Nothing leaves your browser.</h3>
              <p className="max-w-[26ch] text-[13px] leading-6 text-ink/62">
                PDFs are parsed and rendered locally. Your documents are never uploaded to a
                server.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-ink/8 px-6 py-10 md:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-8 md:flex-row">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink/42">
            © 2026 Linea · Designed for understanding
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── reader panel ─── */

function ReaderPanel({
  document,
  page,
  selectedPage,
  settings,
  activeParagraphId,
  activePageNumber,
  activeCharacterIndex,
  selectedParagraphId,
  onSelectPage,
  onSelectParagraph,
  onSelectText,
}: {
  document: ReaderDocument;
  page: ReaderPage;
  selectedPage: number;
  settings: ReaderSettings;
  activeParagraphId: string | null;
  activePageNumber: number | null;
  activeCharacterIndex: number;
  selectedParagraphId: string | null;
  onSelectPage: (page: number) => void;
  onSelectParagraph: (paragraphId: string | null) => void;
  onSelectText: (selection: { text: string; paragraphId: string | null } | null) => void;
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const font = readerFonts[settings.font];

  useEffect(() => {
    onSelectText(null);
    onSelectParagraph(null);
  }, [onSelectParagraph, onSelectText, page.pageNumber]);

  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !articleRef.current) {
      onSelectText(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) { onSelectText(null); return; }
    const anchor = sel.anchorNode;
    const el = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
    if (!el || !articleRef.current.contains(el)) { onSelectText(null); return; }
    const pEl = el.closest<HTMLElement>("[data-paragraph-id]");
    onSelectText({ text, paragraphId: pEl?.dataset.paragraphId ?? null });
  };

  return (
    <article className="linea-reader">
      {page.hasText ? (
        <div
          ref={articleRef as React.RefObject<HTMLDivElement>}
          onMouseUp={handleSelection}
          onKeyUp={handleSelection}
          style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            fontFamily:
              font.className === "font-serif"
                ? "var(--font-serif)"
                : font.className === "font-mono"
                  ? "var(--font-mono)"
                  : "var(--font-sans)",
          }}
        >
          {page.paragraphs
            .filter((p) => p.text.trim() !== page.title.trim())
            .map((paragraph) => (
            <button
              key={paragraph.id}
              type="button"
              data-paragraph-id={paragraph.id}
              onClick={() => {
                const sel = window.getSelection()?.toString().trim();
                if (!sel) {
                  onSelectParagraph(selectedParagraphId === paragraph.id ? null : paragraph.id);
                }
              }}
              className={`linea-paragraph${activeParagraphId === paragraph.id ? " active" : ""}${selectedParagraphId === paragraph.id ? " selected" : ""}${paragraph.skip ? " skipped" : ""}`}
            >
              <span className="linea-paragraph-text">
                {renderParagraphText(
                  paragraph,
                  activeParagraphId === paragraph.id && activePageNumber === page.pageNumber
                    ? activeCharacterIndex
                    : null,
                )}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="linea-status" style={{ marginTop: 20 }}>
          No extractable text on this page. This usually means the page is image-based or needs OCR.
        </div>
      )}

      <div className="linea-reader-nav">
        <button
          type="button"
          className="linea-btn-secondary linea-btn-icon"
          onClick={() => onSelectPage(Math.max(1, selectedPage - 1))}
          disabled={selectedPage === 1}
          style={{ opacity: selectedPage === 1 ? 0.4 : 1 }}
        >
          <ChevronLeft size={14} />
          Previous
        </button>
        <button
          type="button"
          className="linea-btn linea-btn-icon"
          onClick={() => onSelectPage(Math.min(document.pageCount, selectedPage + 1))}
          disabled={selectedPage === document.pageCount}
          style={{ opacity: selectedPage === document.pageCount ? 0.4 : 1 }}
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </article>
  );
}

/* ─── main app ─── */

export function App({ initialDocument }: AppProps) {
  const { theme, toggle: toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [document, setDocument] = useState<ReaderDocument | null>(initialDocument);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<ReaderSettings>(defaultReaderSettings);
  const [selectedPassage, setSelectedPassage] = useState<{
    text: string;
    paragraphId: string | null;
  } | null>(null);
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null);
  const [expandPage, setExpandPage] = useState<number | null>(null);

  const { doc: pdfDoc } = usePdfDocument(pdfData);
  const autoLoadedRef = useRef(false);

  const currentPage = useMemo(
    () => document?.pages.find((p) => p.pageNumber === selectedPage) ?? null,
    [document, selectedPage],
  );

  const voice = useVoiceConsole({
    pages: document?.pages ?? [],
    selectedPage,
    onSelectPage: setSelectedPage,
  });

  const selectedParagraph = useMemo(
    () => currentPage?.paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) ?? null,
    [currentPage, selectedParagraphId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("linea:reader-settings");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Partial<ReaderSettings>;
      setSettings((c) => ({ ...c, ...parsed }));
    } catch {
      window.localStorage.removeItem("linea:reader-settings");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("linea:reader-settings", JSON.stringify(settings));
  }, [settings]);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError("");
    setProgress(null);
    voice.stopSpeaking();
    voice.stopListening();
    try {
      const fileData = new Uint8Array(await file.arrayBuffer());
      setPdfData(fileData);
      const doc = await loadReaderDocument(file, setProgress);
      startTransition(() => {
        setDocument(doc);
        setSelectedPage(1);
        setSelectedParagraphId(null);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PDF could not be parsed.");
    } finally {
      setLoading(false);
    }
  };

  const loadSamplePdf = async (url: string, name: string) => {
    setLoading(true);
    setLoadingSample(name);
    setError("");
    setProgress(null);
    voice.stopSpeaking();
    voice.stopListening();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
      const buffer = await response.arrayBuffer();
      const fileData = new Uint8Array(buffer);
      setPdfData(fileData);
      const file = new File([buffer], name.endsWith(".pdf") ? name : `${name}.pdf`, {
        type: "application/pdf",
      });
      const doc = await loadReaderDocument(file, setProgress);
      startTransition(() => {
        setDocument(doc);
        setSelectedPage(1);
        setSelectedParagraphId(null);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sample PDF.");
    } finally {
      setLoading(false);
      setLoadingSample(null);
    }
  };

  // Auto-load sample PDF on playground route
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (autoLoadedRef.current) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const path = window.location.pathname;
    const isPlayground =
      path === `${base}/playground` ||
      path === "/playground" ||
      new URLSearchParams(window.location.search).get("demo") === "1";
    if (isPlayground) {
      autoLoadedRef.current = true;
      void loadSamplePdf(`${base}/samples/whitepaper.pdf`, "White Paper");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReadFromParagraph = useCallback((paragraph: ReaderParagraph) => {
    const selection = typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "";
    if (selection) return;
    voice.speakFromParagraph(currentPage, paragraph);
  }, [voice, currentPage]);

  const handlePlaySelectedParagraph = useCallback(() => {
    if (!selectedParagraph) return;
    handleReadFromParagraph(selectedParagraph);
  }, [handleReadFromParagraph, selectedParagraph]);

  const handleReadSelection = useCallback(() => {
    if (!selectedPassage) return;
    voice.speakSelection(selectedPassage.text, currentPage, selectedPassage.paragraphId);
  }, [voice, selectedPassage, currentPage]);

  const handlePlayPage = useCallback(() => {
    voice.speakPage(currentPage ?? undefined);
  }, [voice, currentPage]);

  const documentProgress = useMemo(() => {
    if (!document || document.totalWords === 0) return 0;
    const progressPageNumber = voice.activePageNumber ?? selectedPage;
    const progressPage = document.pages.find((p) => p.pageNumber === progressPageNumber) ?? currentPage;
    let wordsBefore = 0;
    for (const p of document.pages) {
      if (p.pageNumber >= (progressPage?.pageNumber ?? 1)) break;
      wordsBefore += p.wordCount;
    }
    const intraRatio =
      voice.playbackWindow.totalWords > 0 && (voice.isSpeaking || voice.isPaused)
        ? voice.playbackWindow.currentWord / voice.playbackWindow.totalWords
        : selectedPage === (progressPage?.pageNumber ?? 1) ? 1 : 0;
    return Math.min(1, (wordsBefore + (progressPage?.wordCount ?? 0) * intraRatio) / document.totalWords);
  }, [document, selectedPage, currentPage, voice.activePageNumber, voice.isSpeaking, voice.isPaused, voice.playbackWindow]);

  /* ── loading sample ── */

  if (!document && loadingSample) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-6 text-center px-8">
        <LoaderCircle size={36} className="animate-spin text-accent" />
        <h2 className="text-2xl font-serif text-ink">Loading {loadingSample}</h2>
        <p className="text-sm text-muted font-mono uppercase tracking-widest">
          {progress?.totalPages
            ? `Extracting page ${progress.loadedPages} of ${progress.totalPages}`
            : "Fetching PDF..."}
        </p>
        {progress?.totalPages ? (
          <div className="w-60 h-1 rounded bg-black/5 overflow-hidden">
            <div
              className="h-full rounded bg-accent transition-[width] duration-300"
              style={{ width: `${Math.round((progress.loadedPages / progress.totalPages) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  /* ── no document ── */

  if (!document) {
    return (
      <Landing onFile={handleFile} loading={loading} progress={progress} error={error} theme={theme} toggleTheme={toggleTheme} />
    );
  }

  /* ── document loaded ── */

  return (
    <div className="linea-page linea-bg-document linea-frame">
      <Header document={document} onUploadClick={() => fileInputRef.current?.click()} onLoadSample={(url, name) => void loadSamplePdf(url, name)} loadingSample={loadingSample} theme={theme} toggleTheme={toggleTheme} settings={settings} onSettingsChange={setSettings} voice={voice} documentProgress={documentProgress} />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file?.type === "application/pdf") void handleFile(file);
        }}
      />

      <PdfSidebar
        doc={pdfDoc}
        document={document}
        selectedPage={selectedPage}
        onSelectPage={setSelectedPage}
        onExpand={setExpandPage}
      />

      <div className="linea-main">
        {error && (
          <div style={{ padding: '0 28px' }}>
            <div className="linea-error">{error}</div>
          </div>
        )}
        {currentPage && (
          <>
            <CommandBar
                document={document}
                page={currentPage}
                selectedPage={selectedPage}
                selectedParagraph={selectedParagraph}
                isSpeaking={voice.isSpeaking}
                isPaused={voice.isPaused}
                activePageNumber={voice.activePageNumber}
                activeParagraphId={voice.activeParagraphId}
                hasSelection={Boolean(selectedPassage?.text)}
                downloadUrl={voice.activity.audioUrl}
                onPlay={handlePlayPage}
                onCancelRequest={voice.cancelRequest}
                onPauseOrResume={voice.pauseOrResume}
                onStop={voice.stopSpeaking}
                onReadSelection={handleReadSelection}
                isRequesting={voice.activity.phase === "requesting"}
                clipProgress={voice.playbackWindow.progress}
                clipElapsedMs={voice.playbackWindow.elapsedMs}
                clipDurationMs={voice.playbackWindow.durationMs}
                clipCurrentWord={voice.playbackWindow.currentWord}
                clipTotalWords={voice.playbackWindow.totalWords}
                onSeekClip={voice.seekPlayback}
              />
              <ReaderPanel
                document={document}
                page={currentPage}
                selectedPage={selectedPage}
                settings={settings}
                activeParagraphId={voice.activeParagraphId}
                activePageNumber={voice.activePageNumber}
                activeCharacterIndex={voice.activeCharacterIndex}
                selectedParagraphId={selectedParagraphId}
                onSelectPage={setSelectedPage}
                onSelectParagraph={setSelectedParagraphId}
                onSelectText={setSelectedPassage}
              />
            </>
          )}
        </div>

      {currentPage && (
        <ContextPanel
          document={document}
          page={currentPage}
          voice={voice}
          selectedParagraph={selectedParagraph}
          selectedParagraphId={selectedParagraphId}
          selectedPage={selectedPage}
          onSelectParagraph={setSelectedParagraphId}
        />
      )}

      {expandPage !== null && pdfDoc && (
        <PdfExpandOverlay
          doc={pdfDoc}
          pageNumber={expandPage}
          totalPages={document.pageCount}
          onClose={() => setExpandPage(null)}
          onNavigate={(p) => {
            setExpandPage(p);
            setSelectedPage(p);
          }}
        />
      )}
    </div>
  );
}
