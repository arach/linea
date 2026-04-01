import {
  Check,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Expand,
  Eye,
  FileUp,
  Highlighter,
  LoaderCircle,
  Lock,
  Menu,
  Moon,
  MousePointer2,
  NotebookPen,
  Sun,
  Pause,
  Play,
  Quote,
  Sparkles,
  Square,
  ALargeSmall,
  AudioLines,
  Palette,
  ScanSearch,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { RedirectToSignIn } from "@clerk/react";
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
  ReaderRect,
} from "@/lib/pdf";
import { fetchLineaExplanation, type LineaExplainResponse } from "@/lib/linea-explain";
import { buildReaderPageFromText, getPdfModule, loadReaderDocument } from "@/lib/pdf";
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
import {
  pollFabricRunnerJob,
  probeFabricRunner,
  submitFabricRunnerOcrPageJob,
} from "@/lib/fabric-runner";
import {
  clearDevInspectorEntries,
  getDevInspectorEntries,
  subscribeDevInspector,
  type DevInspectorEntry,
  type DevInspectorSource,
} from "@/lib/dev-inspector";
import { ClerkAccessControls } from "@/components/clerk-access-controls";
import { ManagedAccessPanel } from "@/components/managed-access-panel";
import { getClerkPublishableKey } from "@/lib/clerk-provider";
import type { LineaManagedAccessSnapshot } from "@/lib/linea-access";
import { useLineaAccessSnapshot } from "@/lib/use-linea-access";
import { formatCount, formatMinutes } from "@/lib/utils";

/* ─── types ─── */

type AppProps = {
  initialDocument: ReaderDocument | null;
};

type ReaderLayoutMode = "text" | "split";

const SIDEBAR_WIDTH_MIN = 220;
const SIDEBAR_WIDTH_MAX = 420;
const DEFAULT_SIDEBAR_WIDTH = 280;

function currentUrl() {
  return typeof window !== "undefined" ? window.location.href : "/";
}

function useStableRedirectUrl() {
  const [redirectUrl, setRedirectUrl] = useState("/");

  useEffect(() => {
    setRedirectUrl(currentUrl());
  }, []);

  return redirectUrl;
}

function readBrowserLocation() {
  if (typeof window === "undefined") {
    return {
      pathname: "/",
      search: "",
    };
  }

  return {
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

function getBasePath() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function getReaderPath() {
  const base = getBasePath();
  return `${base || ""}/playground`;
}

function getDemoPath(sampleFile?: string) {
  const base = getBasePath();
  const path = `${base || ""}/demo`;
  if (!sampleFile) {
    return path;
  }

  return `${path}?sample=${encodeURIComponent(sampleFile)}`;
}

function isReaderPath(pathname: string) {
  return pathname === getReaderPath();
}

function isDemoPath(pathname: string) {
  const base = getBasePath();
  return pathname === `${base || ""}/demo`;
}

function getDemoSampleFile(search: string) {
  const selected = new URLSearchParams(search).get("sample");
  if (selected && FEATURED_DEMO_OPTIONS.some((option) => option.file === selected)) {
    return selected as (typeof FEATURED_DEMO_OPTIONS)[number]["file"];
  }

  return "attention-is-all-you-need.pdf" as const;
}

function getVoiceBlockedLabel(reason: string) {
  const normalized = reason.toLowerCase();

  if (normalized.includes("sign in")) {
    return "Sign in for voice";
  }

  if (normalized.includes("api key")) {
    return "Add key for voice";
  }

  return "Voice unavailable";
}

const FEATURED_DEMO_OPTIONS = [
  {
    file: "attention-is-all-you-need.pdf",
    label: "Attention Is All You Need",
    description: "Start with a dense research paper and see how Linea handles structure, sections, and reading pace.",
    eyebrow: "Research paper",
    icon: Sparkles,
  },
  {
    file: "whitepaper.pdf",
    label: "White Paper",
    description: "Open a polished long-form narrative to feel the calmer reading surface and voice flow together.",
    eyebrow: "Narrative demo",
    icon: BookOpen,
  },
  {
    file: "book-of-verses.pdf",
    label: "Book of Verses",
    description: "Try a scanned document to preview the OCR-first path and how Linea treats irregular source material.",
    eyebrow: "Scan + OCR",
    icon: ScanSearch,
  },
] as const;

function ManagedAuthRedirect() {
  const redirectUrl = useStableRedirectUrl();
  const hasClerkProvider = Boolean(getClerkPublishableKey());
  const title = hasClerkProvider ? "Taking you to sign in." : "Sign-in is still initializing.";
  const body = hasClerkProvider
    ? "Linea is handing this session off to Clerk for secure account verification. After sign-in, you will land right back in your reading space."
    : "This deployment is missing the client-side Clerk publishable key in the current build, so the sign-in flow cannot start yet.";
  const stepCopy = hasClerkProvider
    ? [
        {
          label: "Secure handoff",
          detail: "We verify access first, then open Clerk in a dedicated sign-in flow.",
          icon: Lock,
        },
        {
          label: "Fast redirect",
          detail: "Your browser should move to Clerk almost immediately.",
          icon: ArrowRight,
        },
        {
          label: "Return here",
          detail: "Once you finish, Clerk sends you straight back into Linea.",
          icon: Sparkles,
        },
      ]
    : [
        {
          label: "Missing client key",
          detail: "The browser bundle needs a Clerk publishable key before it can render auth.",
          icon: Lock,
        },
        {
          label: "Server is ready",
          detail: "Managed access and the API are configured, so only the client build needs attention.",
          icon: AudioLines,
        },
        {
          label: "Next fix",
          detail: "Redeploy with the live Clerk env in the client bundle and this screen will disappear.",
          icon: Sparkles,
        },
      ];

  if (!hasClerkProvider) {
    return (
      <div className="min-h-screen overflow-hidden bg-[#f7f0e6] text-ink">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[9%] top-[14%] h-56 w-56 rounded-full bg-accent/10 blur-[92px]" />
          <div className="absolute bottom-[10%] right-[8%] h-72 w-72 rounded-full bg-[#d9c2ad]/30 blur-[112px]" />
        </div>
        <div className="relative flex min-h-screen items-center justify-center px-5 py-14 sm:px-8">
          <div className="relative w-full max-w-[1040px] overflow-hidden rounded-[34px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,242,235,0.96))] shadow-[0_40px_120px_-64px_rgba(0,0,0,0.38)]">
            <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_320px] lg:px-10 lg:py-10">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/12 bg-accent/8 px-3 py-1.5">
                  <Lock size={12} className="text-accent" />
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-accent">
                    Account handoff
                  </span>
                </div>
                <div className="space-y-4">
                  <h1 className="max-w-[14ch] font-serif text-[2.6rem] leading-[0.94] tracking-[-0.05em] text-ink sm:text-[3.55rem]">
                    {title}
                  </h1>
                  <p className="max-w-[36rem] text-[1rem] leading-[1.85] text-ink/64">
                    {body}
                  </p>
                </div>
                <div className="rounded-[24px] border border-black/8 bg-white/72 p-5 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.34)]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-accent/12 text-accent">
                      {hasClerkProvider ? <LoaderCircle size={18} className="animate-spin" /> : <Lock size={18} />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/48">
                        {hasClerkProvider ? "Redirect in progress" : "Waiting on configuration"}
                      </div>
                      <div className="mt-1 text-[1rem] font-medium text-ink">
                        {hasClerkProvider ? "Clerk is opening in a secure auth flow." : "This build needs one more client-side env."}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/6">
                    <div className={`h-full rounded-full bg-accent ${hasClerkProvider ? "w-2/3 animate-pulse" : "w-1/3"}`} />
                  </div>
                </div>
              </div>
              <div className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(247,240,233,0.92))] p-5 shadow-[0_30px_80px_-62px_rgba(0,0,0,0.4)]">
                <div className="space-y-3">
                  <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/46">
                    What Linea is doing
                  </div>
                  {stepCopy.map((step) => {
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.label}
                        className="rounded-[20px] border border-black/8 bg-white/82 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-accent/12 text-accent">
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/46">
                              {step.label}
                            </div>
                            <p className="mt-2 text-[13px] leading-6 text-ink/62">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7f0e6] text-ink">
      <RedirectToSignIn
        forceRedirectUrl={redirectUrl}
        fallbackRedirectUrl={redirectUrl}
      />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[10%] top-[14%] h-56 w-56 rounded-full bg-accent/12 blur-[92px]" />
        <div className="absolute bottom-[8%] right-[10%] h-72 w-72 rounded-full bg-[#dac8b8]/36 blur-[110px]" />
      </div>
      <div className="relative flex min-h-screen items-center justify-center px-5 py-14 sm:px-8">
        <div className="relative w-full max-w-[1040px] overflow-hidden rounded-[34px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,242,235,0.96))] shadow-[0_40px_120px_-64px_rgba(0,0,0,0.38)]">
          <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_320px] lg:px-10 lg:py-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/12 bg-accent/8 px-3 py-1.5">
                <Lock size={12} className="text-accent" />
                <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-accent">
                  Secure sign-in
                </span>
              </div>
              <div className="space-y-4">
                <h1 className="max-w-[14ch] font-serif text-[2.6rem] leading-[0.94] tracking-[-0.05em] text-ink sm:text-[3.55rem]">
                  {title}
                </h1>
                <p className="max-w-[36rem] text-[1rem] leading-[1.85] text-ink/64">
                  {body}
                </p>
              </div>
              <div className="rounded-[24px] border border-black/8 bg-white/72 p-5 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.34)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-accent/12 text-accent">
                    <LoaderCircle size={18} className="animate-spin" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/48">
                      Redirect in progress
                    </div>
                    <div className="mt-1 text-[1rem] font-medium text-ink">
                      Clerk should take over in just a moment.
                    </div>
                  </div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/6">
                  <div className="h-full w-2/3 rounded-full bg-accent animate-pulse" />
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(247,240,233,0.92))] p-5 shadow-[0_30px_80px_-62px_rgba(0,0,0,0.4)]">
              <div className="space-y-3">
                <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/46">
                  What happens next
                </div>
                {stepCopy.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.label}
                      className="rounded-[20px] border border-black/8 bg-white/82 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-accent/12 text-accent">
                          <Icon size={15} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/46">
                            {step.label}
                          </div>
                          <p className="mt-2 text-[13px] leading-6 text-ink/62">
                            {step.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatLandingQuota(limit: number | null, unit: "chars" | "seconds") {
  if (limit == null) {
    return "Unlimited";
  }

  if (unit === "chars") {
    return `${formatCount(limit)} chars`;
  }

  return formatMinutes(Math.max(1, Math.round(limit / 60)));
}

function getLandingWelcomeHeadline(snapshot: LineaManagedAccessSnapshot) {
  if (snapshot.access.status === "blocked") {
    return "You made it in. Shared voice still needs approval.";
  }

  if (snapshot.access.role === "owner") {
    return "Your shared reading space is ready.";
  }

  if (snapshot.access.role === "gifted") {
    return "Shared voice is unlocked for this account.";
  }

  return "Welcome back to Linea.";
}

function getLandingWelcomeBody(snapshot: LineaManagedAccessSnapshot) {
  const email = snapshot.user?.email ?? "this account";

  if (snapshot.access.status === "blocked") {
    return `${email} is signed in, but it is not on the managed-access list yet. You can still open a document and explore the reader while you sort out access.`;
  }

  return `${email} can use the server-managed voice tools on this deployment. Open a document and Linea will keep the provider keys on the server side.`;
}

function LandingWelcomeOverlay({
  snapshot,
  onDismiss,
  onOpenPdf,
  onDropPdf,
  onOpenSample,
  loading,
  loadingSample,
}: {
  snapshot: LineaManagedAccessSnapshot;
  onDismiss: () => void;
  onOpenPdf: () => void;
  onDropPdf: (file: File) => void;
  onOpenSample: (sampleFile: (typeof FEATURED_DEMO_OPTIONS)[number]["file"]) => void;
  loading: boolean;
  loadingSample: string | null;
}) {
  const isBlocked = snapshot.access.status === "blocked";
  const [isDropTarget, setIsDropTarget] = useState(false);
  const isBusy = loading || Boolean(loadingSample);

  const handleDropZoneDragOver = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isBusy) {
      setIsDropTarget(true);
    }
  }, [isBusy]);

  const handleDropZoneDragLeave = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropTarget(false);
  }, []);

  const handleDropZoneDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropTarget(false);

    if (isBusy) {
      return;
    }

    const file = event.dataTransfer.files[0];
    if (file?.type === "application/pdf") {
      onDropPdf(file);
    }
  }, [isBusy, onDropPdf]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-[#f6efe6]/78 backdrop-blur-md"
    >
      <div className="flex min-h-screen items-start justify-center px-5 pb-10 pt-24 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="relative w-full max-w-[980px] overflow-hidden rounded-[34px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,243,236,0.96))] shadow-[0_40px_120px_-60px_rgba(0,0,0,0.4)]"
        >
            <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(212,115,74,0.18),transparent_72%)]" />
            <button
              type="button"
              onClick={onDismiss}
              className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/70 text-ink/56 transition-colors hover:bg-white hover:text-ink"
              aria-label="Dismiss welcome"
            >
              <X size={16} />
            </button>

            <div className="grid gap-8 px-6 pb-6 pt-16 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:gap-10 lg:px-10 lg:pb-10">
              <div className="space-y-7">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/12 bg-accent/8 px-3 py-1.5">
                    <Sparkles size={12} className="text-accent" />
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-accent">
                      {isBlocked ? "Access review" : "Signed in"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <h2 className="max-w-[16ch] font-serif text-[2.4rem] leading-[0.94] tracking-[-0.05em] text-ink sm:text-[3.1rem]">
                      {getLandingWelcomeHeadline(snapshot)}
                    </h2>
                    <p className="max-w-[34rem] text-[0.98rem] leading-[1.85] text-ink/66">
                      {getLandingWelcomeBody(snapshot)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-[22px] border border-black/8 bg-white/78 px-4 py-4 shadow-[0_20px_40px_-36px_rgba(0,0,0,0.35)]">
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/52">
                      <AudioLines size={14} className="text-accent" />
                      Managed voice
                    </div>
                    <div className="text-[1.02rem] font-medium text-ink">
                      {snapshot.access.managedVoice && !isBlocked ? "Enabled" : "Not yet enabled"}
                    </div>
                    <p className="mt-2 text-[13px] leading-6 text-ink/56">
                      {isBlocked
                        ? "You are signed in, but this email still needs shared-access approval."
                        : "Speech requests run through the server so provider keys stay off the client."}
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-black/8 bg-white/78 px-4 py-4 shadow-[0_20px_40px_-36px_rgba(0,0,0,0.35)]">
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/52">
                      <Quote size={14} className="text-accent" />
                      TTS quota
                    </div>
                    <div className="text-[1.02rem] font-medium text-ink">
                      {formatLandingQuota(snapshot.access.quotas.ttsChars.limit, "chars")}
                    </div>
                    <p className="mt-2 text-[13px] leading-6 text-ink/56">
                      {formatCount(snapshot.access.quotas.ttsChars.used)} used this window.
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-black/8 bg-white/78 px-4 py-4 shadow-[0_20px_40px_-36px_rgba(0,0,0,0.35)] sm:col-span-2 xl:col-span-1">
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/52">
                      <BookOpen size={14} className="text-accent" />
                      Transcription
                    </div>
                    <div className="text-[1.02rem] font-medium text-ink">
                      {formatLandingQuota(snapshot.access.quotas.transcriptionSeconds.limit, "seconds")}
                    </div>
                    <p className="mt-2 text-[13px] leading-6 text-ink/56">
                      {snapshot.access.quotas.window.label} · {snapshot.access.meteringMode} metering
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(240px,0.92fr)]">
                    <button
                      type="button"
                      onClick={onOpenPdf}
                      onDragOver={handleDropZoneDragOver}
                      onDragLeave={handleDropZoneDragLeave}
                      onDrop={handleDropZoneDrop}
                      disabled={isBusy}
                      className={`group relative overflow-hidden rounded-[28px] border border-dashed px-5 py-5 text-left transition-all ${
                        isDropTarget
                          ? "border-accent bg-accent/8 shadow-[0_28px_64px_-48px_rgba(207,115,70,0.42)]"
                          : "border-black/12 bg-white/74 shadow-[0_22px_44px_-40px_rgba(0,0,0,0.28)] hover:-translate-y-0.5 hover:border-accent/28 hover:bg-white"
                      } ${isBusy ? "cursor-wait opacity-70" : ""}`}
                    >
                      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_right,rgba(212,115,74,0.12),transparent_70%)]" />
                      <div className="relative flex h-full flex-col justify-between gap-5">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-accent">
                            <Upload size={14} />
                            Open your own PDF
                          </div>
                          <div className="space-y-2">
                            <div className="text-[1.18rem] font-medium text-ink">
                              {isDropTarget ? "Drop your file here." : "Click to browse or drag a PDF onto this card."}
                            </div>
                            <p className="max-w-[34rem] text-[13px] leading-6 text-ink/58">
                              Bring in a real document right away. Extraction still starts in the browser, and shared voice stays server-managed once you are inside the reader.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/88 px-3 py-2 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/62">
                            <Upload size={12} className="text-accent" />
                            {loading ? "Opening…" : isDropTarget ? "Release to open" : "Browse files"}
                          </div>
                          <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/46">
                            PDF only
                          </div>
                        </div>
                      </div>
                    </button>

                    <div className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,240,233,0.9))] p-5 shadow-[0_24px_60px_-50px_rgba(0,0,0,0.34)]">
                      <div className="space-y-3">
                        <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/46">
                          Demo lane
                        </div>
                        <div className="text-[1.02rem] font-medium text-ink">
                          Try a reader-ready sample first.
                        </div>
                        <p className="text-[13px] leading-6 text-ink/58">
                          Instead of one generic demo button, you now have a few different document shapes to drop into immediately.
                        </p>
                        <div className="space-y-2">
                          {FEATURED_DEMO_OPTIONS.map((option, index) => (
                            <div
                              key={option.file}
                              className="flex items-center justify-between rounded-[16px] border border-black/8 bg-white/82 px-3 py-2.5"
                            >
                              <div>
                                <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/42">
                                  0{index + 1}
                                </div>
                                <div className="mt-1 text-[13px] font-medium text-ink">
                                  {option.eyebrow}
                                </div>
                              </div>
                              <ArrowRight size={14} className="text-ink/36" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {FEATURED_DEMO_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isOpeningOption = loadingSample === option.label;

                      return (
                        <button
                          key={option.file}
                          type="button"
                          onClick={() => onOpenSample(option.file)}
                          disabled={isBusy}
                          className={`group rounded-[24px] border border-black/8 bg-white/76 p-4 text-left transition-all hover:-translate-y-1 hover:border-accent/28 hover:bg-white hover:shadow-[0_28px_56px_-48px_rgba(0,0,0,0.4)] ${isBusy ? "cursor-wait opacity-70" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent/12 text-accent">
                              <Icon size={16} />
                            </div>
                            <ArrowRight size={15} className="text-ink/34 transition-transform group-hover:translate-x-0.5" />
                          </div>
                          <div className="mt-4 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-accent">
                            {option.eyebrow}
                          </div>
                          <div className="mt-2 text-[1rem] font-medium text-ink">
                            {option.label}
                          </div>
                          <p className="mt-2 text-[13px] leading-6 text-ink/58">
                            {isOpeningOption ? "Opening sample…" : option.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-ink/40">
                      Dismiss this for now and come back whenever you want.
                    </p>
                    <button
                      type="button"
                      onClick={onDismiss}
                      className="flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-ink/56 transition-colors hover:text-ink sm:px-0"
                    >
                      Maybe later
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(247,240,233,0.88))] p-5 shadow-[0_30px_80px_-64px_rgba(0,0,0,0.45)]">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/46">
                      Signed in as
                    </div>
                    <div className="mt-2 text-[1.05rem] font-medium text-ink">
                      {snapshot.user?.email ?? "Signed-in account"}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[22px] border border-black/8 bg-white/80 p-4">
                    <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-ink/46">
                      What happens next
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-accent/12 text-accent">
                          <BookOpen size={13} />
                        </div>
                        <p className="text-[13px] leading-6 text-ink/62">
                          Pick a PDF or open the demo reader from this landing page.
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-accent/12 text-accent">
                          <AudioLines size={13} />
                        </div>
                        <p className="text-[13px] leading-6 text-ink/62">
                          Voice and alignment requests use the shared server-side configuration attached to this deployment.
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-accent/12 text-accent">
                          <Lock size={13} />
                        </div>
                        <p className="text-[13px] leading-6 text-ink/62">
                          {isBlocked
                            ? "This account is authenticated, but managed entitlements still need to be granted."
                            : "Your provider keys stay on the server, not in the browser."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <ClerkAccessControls snapshot={snapshot} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
  );
}

function DevInspectorSidebar() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DevInspectorEntry[]>(() => getDevInspectorEntries());
  const [activeSources, setActiveSources] = useState<DevInspectorSource[]>(["ora", "vox", "voxd", "fabrun"]);

  useEffect(() => subscribeDevInspector(() => setEntries(getDevInspectorEntries())), []);

  const sourceCounts = useMemo(() => {
    return {
      ora: entries.filter((entry) => entry.source === "ora").length,
      vox: entries.filter((entry) => entry.source === "vox").length,
      voxd: entries.filter((entry) => entry.source === "voxd").length,
      fabrun: entries.filter((entry) => entry.source === "fabrun").length,
    } satisfies Record<DevInspectorSource, number>;
  }, [entries]);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => activeSources.includes(entry.source)),
    [activeSources, entries],
  );

  const toggleSource = (source: DevInspectorSource) => {
    setActiveSources((current) => {
      if (current.includes(source)) {
        return current.length === 1 ? current : current.filter((item) => item !== source);
      }
      return [...current, source];
    });
  };

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="linea-dev-inspector-toggle"
        onClick={() => setOpen((current) => !current)}
      >
        Inspect
        <span>{entries.length}</span>
      </button>
      <aside className={`linea-dev-inspector${open ? " open" : ""}`}>
        <div className="linea-dev-inspector-header">
          <div>
            <div className="linea-dev-inspector-title">Request inspection</div>
            <div className="linea-dev-inspector-subtitle">ora · vox · voxd · fabrun</div>
          </div>
          <div className="linea-dev-inspector-actions">
            <button type="button" className="linea-btn-ghost linea-btn-icon" onClick={() => setEntries(getDevInspectorEntries())}>
              Refresh
            </button>
            <button type="button" className="linea-btn-ghost linea-btn-icon" onClick={() => { clearDevInspectorEntries(); setEntries([]); }}>
              Clear
            </button>
            <button type="button" className="linea-btn-ghost linea-btn-icon" onClick={() => setOpen(false)}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
        <div className="linea-dev-inspector-filters">
          {(["ora", "vox", "voxd", "fabrun"] as DevInspectorSource[]).map((source) => {
            const active = activeSources.includes(source);
            return (
              <button
                key={source}
                type="button"
                className={`linea-dev-filter${active ? " active" : ""}`}
                onClick={() => toggleSource(source)}
              >
                <span className={`linea-dev-source linea-dev-source-${source}`}>{source}</span>
                <span>{sourceCounts[source]}</span>
              </button>
            );
          })}
        </div>
        <div className="linea-dev-inspector-list">
          {visibleEntries.length === 0 ? (
            <div className="linea-dev-inspector-empty">No entries yet.</div>
          ) : (
            visibleEntries.map((entry) => (
              <div key={entry.id} className={`linea-dev-entry linea-dev-entry-${entry.status}`}>
                <div className="linea-dev-entry-top">
                  <span className={`linea-dev-source linea-dev-source-${entry.source}`}>{entry.source}</span>
                  <span className="linea-dev-action">{entry.action}</span>
                  <span className="linea-dev-status">{entry.status}</span>
                </div>
                <div className="linea-dev-entry-meta">
                  {entry.method ? <span>{entry.method}</span> : null}
                  {entry.durationMs != null ? <span>{entry.durationMs}ms</span> : null}
                  <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                {entry.url ? <div className="linea-dev-url">{entry.url}</div> : null}
                {entry.detail ? (
                  <pre className="linea-dev-detail">{JSON.stringify(entry.detail, null, 2)}</pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

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
        return;
      }
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
    } catch {
      /* page may have been cleaned up */
    }
  })();
}

function PdfThumbnail({
  doc,
  pageNumber,
  scale,
  maskTopPercent = 0,
}: {
  doc: PdfDocumentProxy | null;
  pageNumber: number;
  scale: number;
  maskTopPercent?: number;
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

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} />
      {maskTopPercent > 0 ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            insetInline: "6%",
            top: "4.5%",
            height: `${maskTopPercent}%`,
            borderRadius: 10,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.96) 75%, rgba(255,255,255,0.84) 100%)",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
}

function PdfInlinePreview({
  doc,
  pageNumber,
  imageDataUrl,
  pageWidth,
  pageHeight,
  overlayRects,
  interactiveRects,
  scale = 1.35,
  maskTopPercent = 0,
}: {
  doc: PdfDocumentProxy | null;
  pageNumber: number;
  imageDataUrl: string | null;
  pageWidth: number;
  pageHeight: number;
  overlayRects?: Array<{ rect: ReaderRect; tone: "active" | "selected" | "hovered" }>;
  interactiveRects?: Array<{
    id: string;
    rect: ReaderRect;
    active?: boolean;
    selected?: boolean;
    hovered?: boolean;
    onClick: () => void;
    onHover: (hovered: boolean) => void;
  }>;
  scale?: number;
  maskTopPercent?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (imageDataUrl) return;
    const canvas = canvasRef.current;
    if (!canvas || !doc) return;
    const signal = { cancelled: false };
    void renderPdfPage(doc, pageNumber, canvas, scale, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [doc, pageNumber, scale]);

  return (
    <div
      style={{
        border: "1px solid rgba(26, 17, 9, 0.08)",
        borderRadius: 24,
        padding: 18,
        background: "rgba(255,255,255,0.62)",
        boxShadow: "0 18px 44px rgba(26, 17, 9, 0.06)",
        overflow: "hidden",
      }}
    >
      <div className="linea-pdf-inline-surface">
        {imageDataUrl ? (
          <img
            src={imageDataUrl}
            alt={`Page ${pageNumber}`}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: 16,
              background: "#fff",
            }}
          />
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: 16,
              background: "#fff",
            }}
          />
        )}
        {maskTopPercent > 0 ? (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              insetInline: "12%",
              top: "8.5%",
              height: `${maskTopPercent}%`,
              borderRadius: 14,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(255,255,255,0.975) 72%, rgba(255,255,255,0.82) 100%)",
              pointerEvents: "none",
            }}
          />
        ) : null}
        {overlayRects && overlayRects.length > 0 ? (
          <div className="linea-pdf-overlay-layer" aria-hidden="true">
            {overlayRects.map(({ rect, tone }, index) => (
              <div
                key={`${tone}-${pageNumber}-${index}-${rect.x}-${rect.y}`}
                className={`linea-pdf-overlay-rect ${tone}`}
                style={{
                  left: `calc(${(rect.x / Math.max(pageWidth, 1)) * 100}% - 2px)`,
                  top: `calc(${(rect.y / Math.max(pageHeight, 1)) * 100}% - 2px)`,
                  width: `calc(${(rect.width / Math.max(pageWidth, 1)) * 100}% + 4px)`,
                  height: `calc(${(rect.height / Math.max(pageHeight, 1)) * 100}% + 4px)`,
                }}
              />
            ))}
          </div>
        ) : null}
        {interactiveRects && interactiveRects.length > 0 ? (
          <div className="linea-pdf-hit-zone-layer" aria-label={`Page ${pageNumber} paragraph map`}>
            {interactiveRects.map(({ id, rect, active, selected, hovered, onClick, onHover }) => (
              <button
                key={`${pageNumber}-${id}-${rect.x}-${rect.y}`}
                type="button"
                className={`linea-pdf-hit-zone${active ? " active" : ""}${selected ? " selected" : ""}${hovered ? " hovered" : ""}`}
                style={{
                  left: `calc(${(rect.x / Math.max(pageWidth, 1)) * 100}% - 2px)`,
                  top: `calc(${(rect.y / Math.max(pageHeight, 1)) * 100}% - 2px)`,
                  width: `calc(${(rect.width / Math.max(pageWidth, 1)) * 100}% + 4px)`,
                  height: `calc(${(rect.height / Math.max(pageHeight, 1)) * 100}% + 4px)`,
                }}
                onMouseEnter={() => onHover(true)}
                onMouseLeave={() => onHover(false)}
                onFocus={() => onHover(true)}
                onBlur={() => onHover(false)}
                onClick={onClick}
                aria-label="Focus matching paragraph"
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─── pdf expand overlay ─── */

function PdfExpandOverlay({
  doc,
  pageNumber,
  totalPages,
  onPlayPage,
  playPageEnabled,
  playPageLabel,
  onClose,
  onNavigate,
}: {
  doc: PdfDocumentProxy;
  pageNumber: number;
  totalPages: number;
  onPlayPage: () => void;
  playPageEnabled: boolean;
  playPageLabel: string;
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
              onClick={onPlayPage}
              disabled={!playPageEnabled}
              title={!playPageEnabled ? playPageLabel : undefined}
            >
              <Play size={14} />
              {playPageEnabled ? "Read page" : playPageLabel}
            </button>
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
  playbackRangePageNumber,
  playbackParagraphStateById,
  onSelectPage,
  onExpand,
}: {
  doc: PdfDocumentProxy | null;
  document: ReaderDocument;
  selectedPage: number;
  playbackRangePageNumber: number | null;
  playbackParagraphStateById: Record<string, "completed" | "current" | "upcoming">;
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

  const isAttentionDemoDocument =
    document.source?.url?.includes("attention-is-all-you-need.pdf") ||
    document.source?.localPath?.includes("attention-is-all-you-need.pdf") ||
    document.fileName.toLowerCase().includes("attention is all you need");

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
          const pagePlaybackState =
            page.pageNumber === playbackRangePageNumber
              ? Object.values(playbackParagraphStateById).includes("current")
                ? "current"
                : Object.values(playbackParagraphStateById).includes("completed")
                  ? "completed"
                  : Object.values(playbackParagraphStateById).includes("upcoming")
                    ? "upcoming"
                    : null
              : null;

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
              className={`pdf-thumbnail-card${isActive ? " active" : ""}${pagePlaybackState ? ` playback-${pagePlaybackState}` : ""}`}
              onClick={() => {
                if (isActive) {
                  onExpand(page.pageNumber);
                  return;
                }
                onSelectPage(page.pageNumber);
              }}
            >
              <div className="pdf-thumbnail-toolbar">
                <span className="pdf-thumbnail-toolbar-primary">
                  <span className="pdf-thumbnail-badge">{page.pageNumber}</span>
                  {pagePlaybackState ? (
                    <span
                      aria-hidden="true"
                      className={`pdf-thumbnail-read-marker ${pagePlaybackState}`}
                    />
                  ) : null}
                </span>
                <span className="pdf-thumbnail-badge">
                  {page.wordCount ? `${formatCount(page.wordCount)}w` : "No text"}
                </span>
              </div>

              <div className="pdf-thumbnail-frame">
                <PdfThumbnail
                  doc={doc}
                  pageNumber={page.pageNumber}
                  scale={0.22}
                  maskTopPercent={isAttentionDemoDocument && page.pageNumber === 1 ? 12 : 0}
                />
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

function renderParagraphText(
  paragraph: ReaderParagraph,
  options?: {
    highlightRange?: { start: number; end: number } | null;
    annotationRanges?: Array<{ start: number; end: number; tone: "highlight" | "note" }>;
  },
) {
  const highlightRange = options?.highlightRange
    ? {
        start: Math.max(0, Math.min(paragraph.text.length, options.highlightRange.start)),
        end: Math.max(0, Math.min(paragraph.text.length, options.highlightRange.end)),
      }
    : null;
  const annotationRanges = (options?.annotationRanges ?? [])
    .map((range) => ({
      ...range,
      start: Math.max(0, Math.min(paragraph.text.length, range.start)),
      end: Math.max(0, Math.min(paragraph.text.length, range.end)),
    }))
    .filter((range) => range.end > range.start);
  const dimSpans = paragraph.dimSpans ?? [];

  if (dimSpans.length === 0 && !highlightRange && annotationRanges.length === 0) {
    return (
      <span className="linea-text-fragment" data-char-offset={0}>
        {paragraph.text}
      </span>
    );
  }

  const breakpoints = new Set<number>([0, paragraph.text.length]);
  if (highlightRange) {
    breakpoints.add(highlightRange.start);
    breakpoints.add(highlightRange.end);
  }
  for (const range of annotationRanges) {
    breakpoints.add(range.start);
    breakpoints.add(range.end);
  }
  for (const span of dimSpans) {
    breakpoints.add(span.start);
    breakpoints.add(span.end);
  }

  const sortedPoints = Array.from(breakpoints).sort((left, right) => left - right);
  const parts: React.ReactNode[] = [];

  for (let index = 0; index < sortedPoints.length - 1; index += 1) {
    const start = sortedPoints[index]!;
    const end = sortedPoints[index + 1]!;
    if (end <= start) {
      continue;
    }

    const text = paragraph.text.slice(start, end);
    const isDimmed = dimSpans.some((span) => start < span.end && end > span.start);
    const isHighlighted = Boolean(
      highlightRange &&
      start >= highlightRange.start &&
      end <= highlightRange.end &&
      highlightRange.end > highlightRange.start,
    );
    const hasNote = annotationRanges.some(
      (range) => range.tone === "note" && start < range.end && end > range.start,
    );
    const hasSavedHighlight =
      !hasNote &&
      annotationRanges.some((range) => start < range.end && end > range.start);
    const className = [
      "linea-text-fragment",
      isDimmed ? "linea-dim-span" : "",
      hasSavedHighlight ? "linea-saved-highlight" : "",
      hasNote ? "linea-note-highlight" : "",
      isHighlighted ? "linea-reading-highlight" : "",
    ].filter(Boolean).join(" ");

    parts.push(
      <span
        key={`${paragraph.id}-${start}-${end}`}
        className={className}
        data-char-offset={start}
      >
        {text}
      </span>,
    );
  }

  return parts;
}

type ReaderTextSelection = {
  text: string;
  paragraphId: string | null;
  paragraphIds: string[];
  startCharIndex: number | null;
  endCharIndex: number | null;
};

type ReaderMarginaliaKind = "highlight" | "note" | "explanation";

type ReaderMarginalia = {
  id: string;
  kind: ReaderMarginaliaKind;
  pageNumber: number;
  startCharIndex: number;
  endCharIndex: number;
  text: string;
  note?: string;
  explanation?: string;
  provider?: "groq" | "openai" | null;
  model?: string | null;
  usage?: LineaExplainResponse["usage"] | null;
  createdAt: string;
  updatedAt: string;
};

function getDocumentAnnotationStorageKey(document: ReaderDocument) {
  const sourceKey =
    document.source?.url ??
    document.source?.localPath ??
    `${document.fileName}:${document.pageCount}`;

  return `linea:marginalia:${sourceKey}`;
}

function resolveSelectionRange(selection: ReaderTextSelection, page: ReaderPage) {
  if (
    selection.startCharIndex != null &&
    selection.endCharIndex != null &&
    selection.endCharIndex > selection.startCharIndex
  ) {
    return {
      startCharIndex: selection.startCharIndex,
      endCharIndex: selection.endCharIndex,
    };
  }

  if (!selection.paragraphId) {
    return null;
  }

  const paragraph = page.paragraphs.find((entry) => entry.id === selection.paragraphId);
  if (!paragraph) {
    return null;
  }

  return {
    startCharIndex: paragraph.start,
    endCharIndex: paragraph.end,
  };
}

function clearBrowserSelection() {
  if (typeof window === "undefined") {
    return;
  }

  window.getSelection()?.removeAllRanges();
}

function buildResearchLink(provider: "chatgpt" | "gemini" | "google", text: string) {
  if (provider === "chatgpt") {
    return "https://chatgpt.com/";
  }

  if (provider === "gemini") {
    return "https://gemini.google.com/app";
  }

  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

function getMarginaliaIcon(kind: ReaderMarginaliaKind) {
  if (kind === "note") {
    return NotebookPen;
  }

  if (kind === "explanation") {
    return Sparkles;
  }

  return Highlighter;
}

function getMarginaliaLabel(kind: ReaderMarginaliaKind) {
  if (kind === "note") {
    return "Note";
  }

  if (kind === "explanation") {
    return "Explained";
  }

  return "Highlight";
}

function getMarginaliaBody(entry: ReaderMarginalia) {
  if (entry.kind === "note") {
    return entry.note?.trim() || entry.text;
  }

  if (entry.kind === "explanation") {
    return entry.explanation?.trim() || entry.text;
  }

  return entry.text;
}

function shouldHideParagraphFromOutline(paragraph: ReaderParagraph, pageTitle: string) {
  if (paragraph.text.trim() === pageTitle.trim()) {
    return true;
  }

  const skipReason = paragraph.skip?.reason;
  return skipReason === "references" || skipReason === "metadata" || skipReason === "toc";
}

function getExplainBlockedLabel(snapshot: LineaManagedAccessSnapshot) {
  if (!snapshot.enabled) {
    return "Explain selection";
  }

  if (snapshot.access.status === "signed-out") {
    return "Sign in to explain";
  }

  if (snapshot.access.status !== "active") {
    return "Explain unavailable";
  }

  return "Explain selection";
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
  marginalia,
  selectedPassage,
  selectedParagraph,
  selectedParagraphId,
  selectedMarginaliaId,
  selectedPage,
  onPlayPage,
  playPageEnabled,
  playPageLabel,
  onSelectParagraph,
  onSelectMarginalia,
}: {
  document: ReaderDocument;
  page: ReaderPage;
  voice: ReturnType<typeof useVoiceConsole>;
  marginalia: ReaderMarginalia[];
  selectedPassage: ReaderTextSelection | null;
  selectedParagraph: ReaderParagraph | null;
  selectedParagraphId: string | null;
  selectedMarginaliaId: string | null;
  selectedPage: number;
  onPlayPage: () => void;
  playPageEnabled: boolean;
  playPageLabel: string;
  onSelectParagraph: (id: string | null) => void;
  onSelectMarginalia: (id: string | null) => void;
}) {
  const activeParagraph = useMemo(
    () => voice.activeParagraphId
      ? page.paragraphs.find((p) => p.id === voice.activeParagraphId) ?? null
      : null,
    [page.paragraphs, voice.activeParagraphId],
  );

  const isPlaying = voice.isSpeaking || voice.isPaused || voice.activity.phase === "requesting";

  const visibleParagraphs = useMemo(
    () => page.paragraphs.filter((p) => !shouldHideParagraphFromOutline(p, page.title)),
    [page.paragraphs, page.title],
  );
  const selectedTextParagraphIds = useMemo(
    () => new Set(selectedPassage?.paragraphIds ?? []),
    [selectedPassage],
  );
  const isPlaybackRangeVisible = voice.playbackRangePageNumber === page.pageNumber;
  const [marginaliaFilter, setMarginaliaFilter] = useState<"all" | ReaderMarginaliaKind>("all");
  const filteredMarginalia = useMemo(
    () =>
      [...marginalia]
        .filter((entry) => marginaliaFilter === "all" || entry.kind === marginaliaFilter)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [marginalia, marginaliaFilter],
  );
  const selectedMarginalia = useMemo(
    () => filteredMarginalia.find((entry) => entry.id === selectedMarginaliaId) ?? null,
    [filteredMarginalia, selectedMarginaliaId],
  );
  const focusedMarginalia = selectedMarginalia ?? filteredMarginalia[0] ?? null;
  const visibleMarginalia = useMemo(
    () =>
      filteredMarginalia
        .filter((entry) => entry.id !== focusedMarginalia?.id)
        .slice(0, 8),
    [filteredMarginalia, focusedMarginalia?.id],
  );

  return (
    <aside className="linea-context-panel">
      <div className="linea-panel-section">
        <div className="context-page-header">
          <span className="linea-panel-label">Page {page.pageNumber} / {document.pageCount}</span>
          <button
            type="button"
            className="linea-btn-secondary linea-btn-icon linea-page-action"
            onClick={onPlayPage}
            disabled={!playPageEnabled}
            title={!playPageEnabled ? playPageLabel : undefined}
          >
            <Play size={12} />
            {playPageEnabled ? "Read page" : playPageLabel}
          </button>
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

      {/* Selected content (real text highlight) */}
      {selectedPassage && !isPlaying && (
        <div className="linea-panel-section">
          <span className="linea-panel-label">Selected text</span>
          <div className="linea-context-snippet">
            {snippetText(selectedPassage.text)}
          </div>
          <span className="linea-panel-label">
            {selectedPassage.text.split(/\s+/).filter(Boolean).length} words
            {selectedPassage.paragraphIds.length > 1
              ? ` · ${selectedPassage.paragraphIds.length} paragraphs`
              : ""}
          </span>
        </div>
      )}

      {/* Current position (user-clicked paragraph) */}
      {selectedParagraph && !selectedPassage && !isPlaying && (
        <div className="linea-panel-section">
          <span className="linea-panel-label">Current position</span>
          <div className="linea-context-snippet">
            {snippetText(selectedParagraph.text)}
          </div>
          <span className="linea-panel-label">
            {selectedParagraph.text.split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
      )}

      {marginalia.length > 0 && (
        <div className="linea-panel-section">
          <div className="context-section-header">
            <span className="linea-panel-label">
              Marginalia · {filteredMarginalia.length}
            </span>
            <div className="context-filter-row">
              {(["all", "highlight", "note", "explanation"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={`context-filter-chip${marginaliaFilter === entry ? " active" : ""}`}
                  onClick={() => setMarginaliaFilter(entry)}
                >
                  {entry === "all" ? "All" : getMarginaliaLabel(entry)}
                </button>
              ))}
            </div>
          </div>

          {focusedMarginalia ? (
            <div className={`context-marginalia-focus kind-${focusedMarginalia.kind}`}>
              <div className="context-marginalia-focus-top">
                <span className="context-marginalia-focus-label">
                  {getMarginaliaLabel(focusedMarginalia.kind)}
                </span>
                <span className="context-marginalia-focus-meta">
                  {snippetText(focusedMarginalia.text, 36)}
                </span>
              </div>
              <div className="context-marginalia-focus-body">
                {getMarginaliaBody(focusedMarginalia)}
              </div>
            </div>
          ) : null}

          <div className="context-annotation-list">
            {visibleMarginalia.map((entry) => {
              const paragraph = page.paragraphs.find(
                (paragraph) =>
                  entry.endCharIndex > paragraph.start &&
                  entry.startCharIndex < paragraph.end,
              );
              const Icon = getMarginaliaIcon(entry.kind);

              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`context-annotation-item kind-${entry.kind}${selectedMarginaliaId === entry.id ? " active" : ""}`}
                  onClick={() => {
                    onSelectMarginalia(selectedMarginaliaId === entry.id ? null : entry.id);
                    if (paragraph) {
                      onSelectParagraph(paragraph.id);
                      const el = window.document.querySelector(`[data-paragraph-id="${paragraph.id}"]`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }}
                >
                  <div className="context-annotation-top">
                    <span className="context-annotation-kind">
                      <Icon size={12} />
                      {getMarginaliaLabel(entry.kind)}
                    </span>
                    <span className="context-annotation-meta">
                      {snippetText(entry.text, 34)}
                    </span>
                  </div>
                  <div className="context-annotation-body">
                    {getMarginaliaBody(entry)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Paragraph outline */}
      <div className="linea-panel-section context-outline-section">
        <span className="linea-panel-label">Outline · {visibleParagraphs.length} paragraphs</span>
        <div className="context-outline">
          {visibleParagraphs.map((p, i) => {
            const wc = p.text.split(/\s+/).filter(Boolean).length;
            const isActive = voice.activeParagraphId === p.id;
            const isPositioned = selectedParagraphId === p.id;
            const isTextSelected = selectedTextParagraphIds.has(p.id);
            const playbackState = isPlaybackRangeVisible
              ? voice.playbackParagraphStateById[p.id] ?? null
              : null;
            return (
              <button
                key={p.id}
                type="button"
                className={`context-outline-item${isActive ? " active" : ""}${isPositioned ? " positioned" : ""}${isTextSelected ? " text-selected" : ""}${playbackState ? ` playback-${playbackState}` : ""}${p.skip ? " dimmed" : ""}${p.skip?.reason ? ` kind-${p.skip.reason}` : ""}`}
                onClick={() => {
                  onSelectParagraph(selectedParagraphId === p.id ? null : p.id);
                  const el = window.document.querySelector(`[data-paragraph-id="${p.id}"]`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <span
                  aria-hidden="true"
                  className={`context-outline-marker${playbackState ? ` ${playbackState}` : ""}`}
                />
                <span className="context-outline-num">{i + 1}</span>
                <span className="context-outline-text">{snippetText(p.text, p.skip?.reason === "footnote" ? 42 : 50)}</span>
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
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
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
    <div ref={ref} className={`linea-header-popover${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

function ApiKeySetupModal({
  open,
  onClose,
  onCredentialsChanged,
  localRuntime,
  accessSnapshot,
  accessLoading,
  accessError,
}: {
  open: boolean;
  onClose: () => void;
  onCredentialsChanged: () => void;
  localRuntime: ReturnType<typeof useVoiceConsole>["localRuntime"];
  accessSnapshot: ReturnType<typeof useLineaAccessSnapshot>["snapshot"];
  accessLoading: boolean;
  accessError: string;
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
          {accessSnapshot.enabled
            ? "Shared voice is gated by account access and server-side provider keys. Sign in with an approved account to unlock it."
            : "Add API keys for OpenAI and ElevenLabs to enable voice playback. Keys are stored in your operating system secure credential store."}
        </p>
        <ManagedAccessPanel
          snapshot={accessSnapshot}
          loading={accessLoading}
          error={accessError}
          localRuntime={localRuntime}
          onCredentialsChanged={onCredentialsChanged}
        />
      </div>
    </div>,
    document.body,
  );
}

const SAMPLE_DOCUMENTS = [
  {
    file: "attention-is-all-you-need.pdf",
    label: "Attention Is All You Need",
    description: "Seminal transformer paper",
    localPath: "/Users/arach/dev/linea/public/samples/attention-is-all-you-need.pdf",
  },
  {
    file: "whitepaper.pdf",
    label: "White Paper",
    description: "AI research paper",
    localPath: "/Users/arach/dev/linea/public/samples/whitepaper.pdf",
  },
  {
    file: "book.pdf",
    label: "Technical Book",
    description: "Full-length technical book",
    localPath: "/Users/arach/dev/linea/public/samples/book.pdf",
  },
  {
    file: "book-of-verses.pdf",
    label: "Book of Verses",
    description: "Scanned poetry collection",
    localPath: "/Users/arach/dev/linea/public/samples/book-of-verses.pdf",
  },
] as const;

function Header({
  document,
  onGoHome,
  onUploadClick,
  onLoadSample,
  readerLayoutMode,
  onReaderLayoutModeChange,
  loadingSample,
  theme,
  toggleTheme,
  settings,
  onSettingsChange,
  voice,
  documentProgress,
  accessSnapshot,
  accessLoading,
  accessError,
}: {
  document: ReaderDocument | null;
  onGoHome: () => void;
  onUploadClick: () => void;
  onLoadSample: (file: string, label: string, options?: { localPath?: string }) => void;
  readerLayoutMode: ReaderLayoutMode;
  onReaderLayoutModeChange: (mode: ReaderLayoutMode) => void;
  loadingSample: string | null;
  theme: string;
  toggleTheme: () => void;
  settings: ReaderSettings;
  onSettingsChange: (s: ReaderSettings) => void;
  voice: ReturnType<typeof useVoiceConsole>;
  documentProgress: number;
  accessSnapshot: ReturnType<typeof useLineaAccessSnapshot>["snapshot"];
  accessLoading: boolean;
  accessError: string;
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
          <button
            type="button"
            className="linea-logo"
            onClick={onGoHome}
            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
          >
            Linea
          </button>
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
              <div className="linea-layout-toggle" aria-label="Reader view mode">
                <button
                  type="button"
                  className={`linea-chip linea-layout-chip${readerLayoutMode === "text" ? " active" : ""}`}
                  onClick={() => onReaderLayoutModeChange("text")}
                >
                  Text
                </button>
                <button
                  type="button"
                  className={`linea-chip linea-layout-chip${readerLayoutMode === "split" ? " active" : ""}`}
                  onClick={() => onReaderLayoutModeChange("split")}
                >
                  Split
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="linea-btn-ghost linea-btn-icon"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                >
                  {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                </button>
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
                <HeaderPopover
                  open={openPopover === "voice"}
                  onClose={() => setOpenPopover(null)}
                  className="linea-header-popover-voice"
                >
                  {voice.providers.length > 0 ? (
                    <>
                      <div className="voice-popover-header">
                        <div>
                          <span className="linea-panel-label">Voice</span>
                          <div className="voice-popover-title">
                            {voice.selectedProviderMeta?.label ?? "Speech playback"}
                          </div>
                        </div>
                        {voice.selectedVoiceMeta ? (
                          <div className="voice-popover-chip">
                            {voice.selectedVoiceMeta.label}
                          </div>
                        ) : null}
                      </div>
                      <div className="voice-provider-tabs">
                        {voice.providers.map((provider) => (
                          <button
                            key={provider.id}
                            type="button"
                            className={`voice-provider-tab${voice.selectedProvider === provider.id ? " active" : ""}${provider.available ? "" : " unavailable"}`}
                            onClick={() => voice.setSelectedProvider(provider.id)}
                            disabled={!provider.available && voice.providers.some((e) => e.available)}
                          >
                            <span className="voice-provider-copy">
                              <span>{provider.label}</span>
                              <span className="voice-provider-state">
                                {provider.available ? "Configured" : "Needs key"}
                              </span>
                            </span>
                            <span className="voice-provider-count">
                              {voice.selectedProvider === provider.id ? voice.voices.length : "··"}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="voice-popover-section">
                        <div className="voice-selection-summary">
                          <div className="voice-selection-copy">
                            <span className="linea-panel-label">Selected voice</span>
                            <strong>
                              {voice.selectedVoiceMeta?.label ?? "Choose a voice"}
                            </strong>
                            <span>
                              {voice.selectedVoiceMeta
                                ? describeVoice(voice.selectedVoiceMeta)
                                : "Available voices appear below."}
                            </span>
                          </div>
                          <div className="voice-selection-rate">{voice.rate.toFixed(1)}x</div>
                        </div>
                      </div>
                      {voice.loadingVoices ? (
                        <div className="linea-status">Loading voices...</div>
                      ) : voice.voices.length > 0 ? (
                        <div className="voice-card-grid voice-card-grid-compact voice-card-grid-popover">
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
                  <div className="voice-popover-section voice-popover-tuning">
                    <div className="voice-popover-row">
                      <span className="linea-panel-label">Playback rate</span>
                      <span className="voice-rate-badge">{voice.rate.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range" min={0.7} max={1.4} step={0.1}
                      value={voice.rate}
                      onChange={(e) => voice.setRate(Number(e.target.value))}
                      className="linea-slider"
                    />
                  </div>
                  <div className="voice-popover-footer">
                    <button
                      type="button"
                      className="linea-btn-secondary voice-manage-keys"
                      onClick={() => setApiKeyModalOpen(true)}
                    >
                      Manage API keys
                    </button>
                    {voice.localRuntime ? (
                      <div className="voice-runtime-note">
                        VoxD ready on {voice.localRuntime.baseUrl.replace("http://", "")}
                      </div>
                    ) : null}
                  </div>
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
                          onLoadSample(`${base}/samples/${sample.file}`, sample.label, {
                            localPath: sample.localPath,
                          });
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
          <ClerkAccessControls snapshot={accessSnapshot} compact />
        </nav>
      </div>
      <ApiKeySetupModal
        open={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onCredentialsChanged={() => void voice.refreshProviders()}
        localRuntime={voice.localRuntime}
        accessSnapshot={accessSnapshot}
        accessLoading={accessLoading}
        accessError={accessError}
      />
      {document && (
        <div className="linea-doc-progress-strip">
          <div className="linea-progress-fill" style={{ width: `${documentProgress * 100}%` }} />
        </div>
      )}
    </header>
  );
}

function RequestStageGlyph({
  stage,
}: {
  stage: "requesting" | "processing" | "downloading";
}) {
  const activeCount = stage === "requesting" ? 2 : stage === "processing" ? 4 : 6;

  return (
    <div className="linea-request-glyph" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => {
        const active = index < activeCount;
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
  hasParagraphSelected,
  downloadUrl,
  onPlay,
  onPlayParagraph,
  onCancelRequest,
  onPauseOrResume,
  onStop,
  onReadSelection,
  isRequesting,
  requestLabel,
  requestDetail,
  requestStage,
  clipProgress,
  clipElapsedMs,
  clipDurationMs,
  clipCurrentWord,
  clipTotalWords,
  onSeekClip,
  pagePlaybackEnabled,
  paragraphPlaybackEnabled,
  selectionPlaybackEnabled,
  selectionPlaybackLabel,
  playbackBlockedLabel,
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
  hasParagraphSelected: boolean;
  downloadUrl: string | null;
  onPlay: () => void;
  onPlayParagraph: () => void;
  onCancelRequest: () => void;
  onPauseOrResume: () => void;
  onStop: () => void;
  onReadSelection: () => void;
  isRequesting: boolean;
  requestLabel: string;
  requestDetail: string;
  requestStage: "requesting" | "processing" | "downloading" | null;
  clipProgress: number;
  clipElapsedMs: number;
  clipDurationMs: number;
  clipCurrentWord: number;
  clipTotalWords: number;
  onSeekClip: (progress: number) => void;
  pagePlaybackEnabled: boolean;
  paragraphPlaybackEnabled: boolean;
  selectionPlaybackEnabled: boolean;
  selectionPlaybackLabel: string;
  playbackBlockedLabel: string;
}) {
  const wordCount = selectedParagraph
    ? selectedParagraph.text.split(/\s+/).filter(Boolean).length
    : page.wordCount;
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
            <RequestStageGlyph stage={requestStage ?? "requesting"} />
            <div className="linea-command-requesting-copy">
              <span className="linea-command-requesting-label">{requestLabel}</span>
              <span className="linea-command-requesting-detail">{requestDetail}</span>
            </div>
          </div>
        )}

        <div className="linea-command-actions">
          {/* Play/pause — context-aware: selection > paragraph > page */}
          {isSpeaking || isPaused ? (
            <>
              <button
                type="button"
                className="linea-btn-secondary linea-btn-icon"
                onClick={onPauseOrResume}
              >
                {isSpeaking ? <Pause size={14} /> : <Play size={14} />}
                {isSpeaking ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                className="linea-btn-secondary linea-btn-icon"
                onClick={onStop}
              >
                <Square size={14} /> Stop
              </button>
            </>
          ) : (
            <>
              {selectionPlaybackEnabled && hasSelection ? (
                <button type="button" className="linea-btn-secondary linea-btn-icon" onClick={onReadSelection}>
                  <Play size={14} /> {selectionPlaybackLabel}
                </button>
              ) : paragraphPlaybackEnabled && hasParagraphSelected ? (
                <button type="button" className="linea-btn-secondary linea-btn-icon" onClick={onPlayParagraph}>
                  <Play size={14} /> Play paragraph
                </button>
              ) : (
                <button
                  type="button"
                  className="linea-btn-secondary linea-btn-icon"
                  onClick={onPlay}
                  disabled={!pagePlaybackEnabled}
                  title={!pagePlaybackEnabled ? playbackBlockedLabel : undefined}
                >
                  <Play size={14} /> {pagePlaybackEnabled ? "Play page" : playbackBlockedLabel}
                </button>
              )}
            </>
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
  onOpenDemo,
  loading,
  loadingSample,
  progress,
  error,
  theme,
  toggleTheme,
  accessSnapshot,
}: {
  onFile: (file: File) => void;
  onOpenDemo: (sampleFile?: (typeof FEATURED_DEMO_OPTIONS)[number]["file"]) => void;
  loading: boolean;
  loadingSample: string | null;
  progress: ExtractionProgress | null;
  error: string;
  theme: string;
  toggleTheme: () => void;
  accessSnapshot: LineaManagedAccessSnapshot;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shouldGateReaderEntry =
    accessSnapshot.enabled &&
    accessSnapshot.clerkConfigured &&
    accessSnapshot.access.status === "signed-out";
  const welcomeStorageKey = accessSnapshot.user
    ? `linea:landing-welcome:${accessSnapshot.user.id}:${accessSnapshot.access.status}:${accessSnapshot.access.role}`
    : null;

  useEffect(() => {
    if (typeof window === "undefined" || !welcomeStorageKey) {
      setWelcomeDismissed(false);
      return;
    }

    setWelcomeDismissed(window.sessionStorage.getItem(welcomeStorageKey) === "1");
  }, [welcomeStorageKey]);

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

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);

    if (typeof window !== "undefined" && welcomeStorageKey) {
      window.sessionStorage.setItem(welcomeStorageKey, "1");
    }
  }, [welcomeStorageKey]);

  const shouldShowWelcome =
    !loading &&
    accessSnapshot.enabled &&
    Boolean(accessSnapshot.user) &&
    !welcomeDismissed;

  const openPdfFromLanding = useCallback(() => {
    if (shouldGateReaderEntry) {
      window.location.assign(getReaderPath());
      return;
    }

    inputRef.current?.click();
  }, [shouldGateReaderEntry]);

  return (
    <div className="min-h-screen bg-bg selection:bg-accent/20 selection:text-ink">
      <AnimatePresence>
        {shouldShowWelcome ? (
          <LandingWelcomeOverlay
            snapshot={accessSnapshot}
            onDismiss={dismissWelcome}
            onOpenPdf={() => {
              dismissWelcome();
              openPdfFromLanding();
            }}
            onDropPdf={(file) => {
              dismissWelcome();
              onFile(file);
            }}
            onOpenSample={(sampleFile) => {
              dismissWelcome();
              onOpenDemo(sampleFile);
            }}
            loading={loading}
            loadingSample={loadingSample}
          />
        ) : null}
      </AnimatePresence>

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
          <a
            href={getBasePath() || "/"}
            className="pl-2 text-[11px] font-mono font-semibold uppercase tracking-[0.28em] text-ink transition-colors hover:text-ink/72"
          >
            Linea
          </a>
          <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-[0.16em] text-ink/48">
            <a
              href={getDemoPath()}
              onClick={(event) => {
                event.preventDefault();
                onOpenDemo();
              }}
              className="transition-colors hover:text-ink"
            >
              Demo
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-full transition-colors hover:bg-ink/5"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <ClerkAccessControls snapshot={accessSnapshot} compact />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1240px] px-6 pb-28 pt-12 md:px-8 md:pt-16">
        <div className="flex flex-col gap-18 md:gap-20">
          {error && <div className="linea-error">{error}</div>}

          {/* Hero */}
          <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-14">
            <div className="space-y-8 md:space-y-9">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-[10px] border border-accent/10 bg-accent/8 px-3 py-1.5">
                  <Sparkles size={12} className="text-accent" />
                  <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.18em] text-accent">New: AI-Powered Context</span>
                </div>
                <h1 className="max-w-[14ch] font-serif text-[3.75rem] leading-[0.9] tracking-[-0.055em] text-ink md:text-[5.2rem] lg:text-[5.85rem]">
                  A reading space for <span className="italic">deep focus.</span>
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
                  onClick={openPdfFromLanding}
                  disabled={loading}
                  className="group flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[9px] font-mono font-semibold uppercase tracking-[0.11em] text-white shadow-xl shadow-accent/20 transition-all hover:brightness-110 disabled:opacity-50 sm:px-6 sm:py-3"
                >
                  <Upload size={14} className="group-hover:-translate-y-0.5 transition-transform" />
                  {loading ? "Opening..." : "Open a PDF"}
                </button>
                <a
                  href={getDemoPath()}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenDemo();
                  }}
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

            </div>

            {/* Preview + value props */}
            <div className="relative lg:translate-x-10 lg:-translate-y-2">
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
            </div>
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
  pdfDoc,
  pageImageDataUrl,
  selectedPage,
  readerLayoutMode,
  settings,
  selectedPassage,
  marginalia,
  selectedMarginaliaId,
  activeParagraphId,
  activeTokenRange,
  activePageNumber,
  playbackRangePageNumber,
  playbackRangeStartParagraphId,
  playbackRangeEndParagraphId,
  playbackParagraphStateById,
  selectedParagraphId,
  isAudioActive,
  onSelectPage,
  onSelectParagraph,
  onSelectMarginalia,
  onSelectText,
  onSeekToChar,
  onPlayPage,
  onReadSelection,
  explainEnabled,
  explainActionLabel,
  onExplainSelection,
  onSaveMarginalia,
  onCopySelection,
  onRunOcr,
  ocrStatus,
  selectionPlaybackEnabled,
  selectionPlaybackLabel,
  playPageEnabled,
  playPageLabel,
}: {
  document: ReaderDocument;
  page: ReaderPage;
  pdfDoc: PdfDocumentProxy | null;
  pageImageDataUrl: string | null;
  selectedPage: number;
  readerLayoutMode: ReaderLayoutMode;
  settings: ReaderSettings;
  selectedPassage: ReaderTextSelection | null;
  marginalia: ReaderMarginalia[];
  selectedMarginaliaId: string | null;
  activeParagraphId: string | null;
  activeTokenRange: { start: number; end: number } | null;
  activePageNumber: number | null;
  playbackRangePageNumber: number | null;
  playbackRangeStartParagraphId: string | null;
  playbackRangeEndParagraphId: string | null;
  playbackParagraphStateById: Record<string, "completed" | "current" | "upcoming">;
  selectedParagraphId: string | null;
  isAudioActive: boolean;
  onSelectPage: (page: number) => void;
  onSelectParagraph: (paragraphId: string | null) => void;
  onSelectMarginalia: (id: string | null) => void;
  onSelectText: (selection: ReaderTextSelection | null) => void;
  onSeekToChar: (charIndex: number) => void;
  onPlayPage: () => void;
  onReadSelection: () => void;
  explainEnabled: boolean;
  explainActionLabel: string;
  onExplainSelection: (selection: ReaderTextSelection, page: ReaderPage) => Promise<LineaExplainResponse>;
  onSaveMarginalia: (
    selection: ReaderTextSelection,
    update:
      | { kind: "highlight" }
      | { kind: "note"; note: string }
      | { kind: "explanation"; explanation: LineaExplainResponse },
  ) => ReaderMarginalia | null;
  onCopySelection: (selection: ReaderTextSelection) => void;
  onRunOcr: () => void;
  ocrStatus: {
    state: "idle" | "probing" | "running" | "completed" | "empty" | "failed";
    message?: string;
  } | null;
  selectionPlaybackEnabled: boolean;
  selectionPlaybackLabel: string;
  playPageEnabled: boolean;
  playPageLabel: string;
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const font = readerFonts[settings.font];
  const readerTheme = readerThemes[settings.theme];
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [noteComposer, setNoteComposer] = useState<{
    selection: ReaderTextSelection;
    rect: DOMRect;
    value: string;
  } | null>(null);
  const [explanationCard, setExplanationCard] = useState<{
    selection: ReaderTextSelection;
    rect: DOMRect;
    status: "loading" | "done" | "error";
    explanation: string;
    error: string;
    provider: "groq" | "openai" | null;
    model: string | null;
    usage: LineaExplainResponse["usage"] | null;
  } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "done">("idle");
  const [hoveredParagraphId, setHoveredParagraphId] = useState<string | null>(null);
  const isPlaybackRangeVisible = playbackRangePageNumber === page.pageNumber;
  const showSplitView = readerLayoutMode === "split" && Boolean(pdfDoc);
  const shouldShowPdfSource =
    !page.hasText ||
    ocrStatus?.state === "running" ||
    ocrStatus?.state === "completed" ||
    ocrStatus?.state === "empty" ||
    ocrStatus?.state === "failed";

  useEffect(() => {
    onSelectText(null);
    onSelectParagraph(null);
    setHoveredParagraphId(null);
    setSelectionRect(null);
    setNoteComposer(null);
    setExplanationCard(null);
  }, [onSelectParagraph, onSelectText, page.pageNumber]);

  const scrollParagraphIntoView = useCallback((paragraphId: string, behavior: ScrollBehavior = "smooth") => {
    const el = articleRef.current?.querySelector<HTMLElement>(`[data-paragraph-id="${paragraphId}"]`);
    el?.scrollIntoView({ behavior, block: "center" });
  }, []);

  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !articleRef.current) {
      onSelectText(null);
      setSelectionRect(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) { onSelectText(null); setSelectionRect(null); return; }

    const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const getParagraphElement = (node: Node | null) => {
      const element = node instanceof Element ? node : node?.parentElement ?? null;
      return element?.closest<HTMLElement>("[data-paragraph-id]") ?? null;
    };
    const startParagraphEl = getParagraphElement(range?.startContainer ?? null);
    const endParagraphEl = getParagraphElement(range?.endContainer ?? null);
    const paragraphElement = getParagraphElement(sel.anchorNode);

    if (!paragraphElement || !articleRef.current.contains(paragraphElement)) {
      onSelectText(null);
      setSelectionRect(null);
      return;
    }

    const getTextOffsetWithinParagraph = (
      paragraphEl: HTMLElement,
      container: Node,
      offset: number,
    ) => {
      const measurementRange = window.document.createRange();
      const contentRoot =
        paragraphEl.querySelector<HTMLElement>(".linea-paragraph-text") ?? paragraphEl;
      measurementRange.selectNodeContents(contentRoot);
      measurementRange.setEnd(container, offset);
      return measurementRange.toString().length;
    };

    const startParagraphId = startParagraphEl?.dataset.paragraphId ?? null;
    const endParagraphId = endParagraphEl?.dataset.paragraphId ?? null;
    const startParagraph = page.paragraphs.find((entry) => entry.id === startParagraphId) ?? null;
    const endParagraph = page.paragraphs.find((entry) => entry.id === endParagraphId) ?? null;

    let paragraphIds: string[] = paragraphElement.dataset.paragraphId
      ? [paragraphElement.dataset.paragraphId]
      : [];
    let startCharIndex: number | null = null;
    let endCharIndex: number | null = null;

    if (
      range &&
      startParagraphEl &&
      endParagraphEl &&
      startParagraph &&
      endParagraph &&
      articleRef.current.contains(startParagraphEl) &&
      articleRef.current.contains(endParagraphEl)
    ) {
      const rawStartOffset = getTextOffsetWithinParagraph(
        startParagraphEl,
        range.startContainer,
        range.startOffset,
      );
      const rawEndOffset = getTextOffsetWithinParagraph(
        endParagraphEl,
        range.endContainer,
        range.endOffset,
      );
      const boundedStartOffset = Math.max(0, Math.min(startParagraph.text.length, rawStartOffset));
      const boundedEndOffset = Math.max(0, Math.min(endParagraph.text.length, rawEndOffset));

      startCharIndex = startParagraph.start + boundedStartOffset;
      endCharIndex = endParagraph.start + boundedEndOffset;

      if (endCharIndex < startCharIndex) {
        [startCharIndex, endCharIndex] = [endCharIndex, startCharIndex];
      }

      if (startCharIndex !== null && endCharIndex !== null && endCharIndex > startCharIndex) {
        paragraphIds = page.paragraphs
          .filter((paragraph) => paragraph.end > startCharIndex && paragraph.start < endCharIndex)
          .map((paragraph) => paragraph.id);
      }
    }

    onSelectText({
      text,
      paragraphId: paragraphIds[0] ?? paragraphElement.dataset.paragraphId ?? null,
      paragraphIds,
      startCharIndex,
      endCharIndex,
    });
    setSelectionRect(range?.getBoundingClientRect() ?? null);
  };

  // Clear popover when browser selection is dismissed
  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setSelectionRect(null);
    };
    window.document.addEventListener("selectionchange", onSelChange);
    return () => window.document.removeEventListener("selectionchange", onSelChange);
  }, []);

  useEffect(() => {
    if (copyState !== "done") {
      return;
    }

    const timeout = window.setTimeout(() => setCopyState("idle"), 1200);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const annotationRangesByParagraphId = useMemo(() => {
    const map: Record<string, Array<{ start: number; end: number; tone: "highlight" | "note" }>> = {};

    for (const annotation of marginalia) {
      if (annotation.kind === "explanation") {
        continue;
      }
      for (const paragraph of page.paragraphs) {
        if (annotation.endCharIndex <= paragraph.start || annotation.startCharIndex >= paragraph.end) {
          continue;
        }

        const localStart = Math.max(0, annotation.startCharIndex - paragraph.start);
        const localEnd = Math.min(paragraph.text.length, annotation.endCharIndex - paragraph.start);
        if (localEnd <= localStart) {
          continue;
        }

        map[paragraph.id] ??= [];
        map[paragraph.id]!.push({
          start: localStart,
          end: localEnd,
          tone: annotation.kind === "note" ? "note" : "highlight",
        });
      }
    }

    return map;
  }, [marginalia, page.paragraphs]);

  const existingSelectionAnnotation = useMemo(() => {
    if (!selectedPassage) {
      return null;
    }

    const range = resolveSelectionRange(selectedPassage, page);
    if (!range) {
      return null;
    }

    return marginalia.find(
      (annotation) =>
        annotation.pageNumber === page.pageNumber &&
        annotation.startCharIndex === range.startCharIndex &&
        annotation.endCharIndex === range.endCharIndex &&
        annotation.kind !== "explanation"
    ) ?? null;
  }, [marginalia, page, selectedPassage]);

  const marginaliaByParagraphId = useMemo(() => {
    const map: Record<string, ReaderMarginalia[]> = {};

    for (const entry of marginalia) {
      for (const paragraph of page.paragraphs) {
        if (entry.endCharIndex <= paragraph.start || entry.startCharIndex >= paragraph.end) {
          continue;
        }

        map[paragraph.id] ??= [];
        map[paragraph.id]!.push(entry);
      }
    }

    for (const key of Object.keys(map)) {
      map[key]!.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }

    return map;
  }, [marginalia, page.paragraphs]);

  const closeSelectionUi = useCallback(() => {
    clearBrowserSelection();
    onSelectText(null);
    setSelectionRect(null);
    setNoteComposer(null);
    setExplanationCard(null);
  }, [onSelectText]);

  const sourceOverlayRects = useMemo(() => {
    const activeParagraph =
      isAudioActive && activePageNumber === page.pageNumber
        ? page.paragraphs.find((paragraph) => paragraph.id === activeParagraphId) ?? null
        : null;
    const hoveredParagraph =
      hoveredParagraphId
        ? page.paragraphs.find((paragraph) => paragraph.id === hoveredParagraphId) ?? null
        : null;
    const selectedParagraph =
      !activeParagraph && !hoveredParagraph && selectedParagraphId
        ? page.paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) ?? null
        : null;
    const overlays: Array<{ rect: ReaderRect; tone: "active" | "selected" | "hovered" }> = [];

    if (selectedParagraph?.boxes?.length) {
      overlays.push(...selectedParagraph.boxes.map((rect) => ({ rect, tone: "selected" as const })));
    }

    if (hoveredParagraph?.boxes?.length) {
      overlays.push(...hoveredParagraph.boxes.map((rect) => ({ rect, tone: "hovered" as const })));
    }

    if (activeParagraph?.boxes?.length) {
      overlays.push(...activeParagraph.boxes.map((rect) => ({ rect, tone: "active" as const })));
    }

    return overlays;
  }, [
    activePageNumber,
    activeParagraphId,
    hoveredParagraphId,
    isAudioActive,
    page.pageNumber,
    page.paragraphs,
    selectedParagraphId,
  ]);
  const sourceInteractiveRects = useMemo(
    () =>
      page.paragraphs
        .filter((paragraph) => paragraph.text.trim() !== page.title.trim() && Boolean(paragraph.boxes?.length))
        .flatMap((paragraph) =>
          (paragraph.boxes ?? []).map((rect) => ({
            id: paragraph.id,
            rect,
            active:
              isAudioActive &&
              activePageNumber === page.pageNumber &&
              activeParagraphId === paragraph.id,
            selected: selectedParagraphId === paragraph.id,
            hovered: hoveredParagraphId === paragraph.id,
            onClick: () => {
              clearBrowserSelection();
              onSelectText(null);
              setSelectionRect(null);
              setNoteComposer(null);
              setExplanationCard(null);
              setHoveredParagraphId(paragraph.id);
              onSelectParagraph(paragraph.id);
              scrollParagraphIntoView(paragraph.id);
            },
            onHover: (hovered: boolean) => {
              setHoveredParagraphId((current) => (hovered ? paragraph.id : current === paragraph.id ? null : current));
            },
          })),
        ),
    [
      activePageNumber,
      activeParagraphId,
      hoveredParagraphId,
      isAudioActive,
      onSelectParagraph,
      onSelectText,
      page.pageNumber,
      page.paragraphs,
      page.title,
      scrollParagraphIntoView,
      selectedParagraphId,
    ],
  );
  const isAttentionDemoDocument =
    document.source?.url?.includes("attention-is-all-you-need.pdf") ||
    document.source?.localPath?.includes("attention-is-all-you-need.pdf") ||
    document.fileName.toLowerCase().includes("attention is all you need");
  const shouldMaskAttentionDemoBanner = isAttentionDemoDocument && page.pageNumber === 1;

  const sourcePane = (
    <div className={`linea-reader-source${showSplitView ? " split" : ""}`}>
      <div className="linea-reader-source-header">
        <div>
          <span className="linea-panel-label">Source page</span>
          <div className="linea-reader-source-copy">
            Rendered locally from the original PDF
          </div>
        </div>
        <button
          type="button"
          className="linea-btn-secondary linea-btn-icon linea-page-action"
          onClick={onPlayPage}
          disabled={!playPageEnabled}
          title={!playPageEnabled ? playPageLabel : undefined}
        >
          <Play size={12} />
          {playPageEnabled ? "Read page" : playPageLabel}
        </button>
      </div>
      <PdfInlinePreview
        doc={pdfDoc}
        pageNumber={page.pageNumber}
        imageDataUrl={pageImageDataUrl}
        pageWidth={page.width}
        pageHeight={page.height}
        overlayRects={sourceOverlayRects}
        interactiveRects={sourceInteractiveRects}
        scale={showSplitView ? 1.7 : 1.35}
        maskTopPercent={shouldMaskAttentionDemoBanner ? 11 : 0}
      />
    </div>
  );

  const textPane = page.hasText ? (
    <div
      ref={articleRef as React.RefObject<HTMLDivElement>}
      onMouseUp={handleSelection}
      onKeyUp={handleSelection}
      className="linea-reader-text-pane"
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
        .map((paragraph) => {
          const playbackState = isPlaybackRangeVisible
            ? playbackParagraphStateById[paragraph.id] ?? null
            : null;
          const isActivePlaybackParagraph =
            isAudioActive &&
            activePageNumber === page.pageNumber &&
            activeParagraphId === paragraph.id;
          const activeHighlightRange =
            isActivePlaybackParagraph &&
            activeTokenRange &&
            activeTokenRange.end > paragraph.start &&
            activeTokenRange.start < paragraph.end
              ? {
                  start: Math.max(0, activeTokenRange.start - paragraph.start),
                  end: Math.min(paragraph.text.length, activeTokenRange.end - paragraph.start),
                }
              : null;
          const paragraphMarginalia = marginaliaByParagraphId[paragraph.id] ?? [];
          const skipReasonClass = paragraph.skip?.reason ? ` skip-${paragraph.skip.reason}` : "";

          return (
            <div
              key={paragraph.id}
              className={`linea-reading-row${paragraphMarginalia.length > 0 ? " has-marginalia" : ""}`}
            >
              <div
                role="button"
                tabIndex={0}
                data-paragraph-id={paragraph.id}
                onClick={(e) => {
                  const sel = window.getSelection()?.toString().trim();
                  if (sel) return;

                  if (isAudioActive && activePageNumber === page.pageNumber) {
                    const target = e.target as HTMLElement;
                    const charOffset = target.dataset.charOffset;
                    if (charOffset != null) {
                      onSeekToChar(paragraph.start + Number(charOffset));
                    } else {
                      onSeekToChar(paragraph.start);
                    }
                    return;
                  }

                  onSelectParagraph(selectedParagraphId === paragraph.id ? null : paragraph.id);
                }}
                onMouseEnter={() => setHoveredParagraphId(paragraph.id)}
                onMouseLeave={() => setHoveredParagraphId((current) => (current === paragraph.id ? null : current))}
                onFocus={() => setHoveredParagraphId(paragraph.id)}
                onBlur={() => setHoveredParagraphId((current) => (current === paragraph.id ? null : current))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectParagraph(selectedParagraphId === paragraph.id ? null : paragraph.id);
                  }
                }}
                className={`linea-paragraph${isActivePlaybackParagraph ? " active" : ""}${selectedParagraphId === paragraph.id ? " positioned" : ""}${hoveredParagraphId === paragraph.id ? " hovered" : ""}${paragraph.skip ? " skipped" : ""}${skipReasonClass}${playbackState ? ` playback-${playbackState}` : ""}${playbackRangeStartParagraphId === paragraph.id ? " playback-range-start" : ""}${playbackRangeEndParagraphId === paragraph.id ? " playback-range-end" : ""}${isActivePlaybackParagraph ? ` ${readerTheme.activeParagraphClass}` : ""}`}
              >
                {playbackState ? (
                  <span
                    aria-hidden="true"
                    className={`linea-playback-rail ${playbackState}${playbackRangeStartParagraphId === paragraph.id ? " range-start" : ""}${playbackRangeEndParagraphId === paragraph.id ? " range-end" : ""}`}
                  />
                ) : null}
                <span className="linea-paragraph-text">
                  {renderParagraphText(paragraph, {
                    highlightRange: activeHighlightRange,
                    annotationRanges: annotationRangesByParagraphId[paragraph.id] ?? [],
                  })}
                </span>
              </div>
              <div className="linea-marginalia-rail" aria-label="Marginalia markers">
                {paragraphMarginalia.map((entry) => {
                  const Icon = getMarginaliaIcon(entry.kind);
                  const isSelected = selectedMarginaliaId === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`linea-marginalia-marker kind-${entry.kind}${isSelected ? " active" : ""}`}
                      title={`${getMarginaliaLabel(entry.kind)} · ${snippetText(entry.text, 50)}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectMarginalia(isSelected ? null : entry.id);
                        onSelectParagraph(paragraph.id);
                      }}
                    >
                      <Icon size={12} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  ) : (
    <div style={{ display: "grid", gap: 12, marginTop: showSplitView ? 0 : 20 }}>
      <div className="linea-status">
        {ocrStatus?.state === "probing"
          ? "Checking Fabric Runner for OCR support..."
          : ocrStatus?.state === "running"
            ? "Extracting text with Fabric Runner..."
            : ocrStatus?.state === "empty"
              ? "OCR completed, but no readable text was recovered from this page."
              : ocrStatus?.state === "failed"
                ? ocrStatus.message ?? "OCR failed for this page."
                : "No extractable text on this page. This usually means the page is image-based or needs OCR."}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="linea-btn-secondary linea-btn-icon"
          onClick={onRunOcr}
          disabled={ocrStatus?.state === "probing" || ocrStatus?.state === "running"}
        >
          <ScanSearch size={14} />
          {ocrStatus?.state === "failed" || ocrStatus?.state === "empty" ? "Retry OCR" : "Run OCR"}
        </button>
        <span className="linea-panel-label">
          {document.source?.localPath
            ? "Linea contacts local Fabric Runner only after you choose Run OCR"
            : "OCR is currently available for local sample documents"}
        </span>
      </div>
    </div>
  );

  return (
    <article className={`linea-reader ${readerTheme.surfaceClass}`}>
      {showSplitView ? (
        <div className="linea-reader-split">
          {sourcePane}
          {textPane}
        </div>
      ) : (
        <>
          {shouldShowPdfSource ? sourcePane : null}
          {textPane}
        </>
      )}

      {selectedPassage && selectionRect && !noteComposer && !explanationCard && createPortal(
        <div
          className="linea-selection-popover"
          style={{
            top: `${selectionRect.top - 42}px`,
            left: `${selectionRect.left + selectionRect.width / 2}px`,
          }}
        >
          <div className="linea-selection-toolbar">
            <button
              type="button"
              className="linea-selection-popover-btn"
              disabled={!selectionPlaybackEnabled}
              onMouseDown={(e) => {
                e.preventDefault();
                onReadSelection();
                closeSelectionUi();
              }}
              title={!selectionPlaybackEnabled ? playPageLabel : undefined}
            >
              <Play size={12} /> {selectionPlaybackEnabled ? selectionPlaybackLabel : playPageLabel}
            </button>
            <button
              type="button"
              className="linea-selection-popover-btn"
              disabled={!explainEnabled}
              title={!explainEnabled ? explainActionLabel : undefined}
              onMouseDown={async (e) => {
                e.preventDefault();
                if (!explainEnabled) {
                  return;
                }
                const anchorRect = selectionRect;
                setExplanationCard({
                  selection: selectedPassage,
                  rect: anchorRect,
                  status: "loading",
                  explanation: "",
                  error: "",
                  provider: null,
                  model: null,
                  usage: null,
                });
                setSelectionRect(null);

                try {
                  const result = await onExplainSelection(selectedPassage, page);
                  setExplanationCard((current) => {
                    if (!current) {
                      return current;
                    }

                    return {
                      ...current,
                      status: "done",
                      explanation: result.explanation,
                      error: "",
                      provider: result.provider,
                      model: result.model,
                      usage: result.usage,
                    };
                  });
                  const saved = onSaveMarginalia(selectedPassage, {
                    kind: "explanation",
                    explanation: result,
                  });
                  if (saved) {
                    onSelectMarginalia(saved.id);
                    setExplanationCard(null);
                    clearBrowserSelection();
                    onSelectText(null);
                  }
                } catch (error) {
                  setExplanationCard((current) => {
                    if (!current) {
                      return current;
                    }

                    return {
                      ...current,
                      status: "error",
                      explanation: "",
                      error: error instanceof Error ? error.message : "Explain failed.",
                      provider: null,
                      model: null,
                      usage: null,
                    };
                  });
                }
              }}
            >
              <Sparkles size={12} /> {explainEnabled ? "Explain" : explainActionLabel}
            </button>
            <button
              type="button"
              className={`linea-selection-popover-btn${existingSelectionAnnotation ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                const saved = onSaveMarginalia(selectedPassage, { kind: "highlight" });
                if (saved) {
                  onSelectMarginalia(saved.id);
                }
                closeSelectionUi();
              }}
            >
              <Highlighter size={12} /> {existingSelectionAnnotation ? "Saved" : "Highlight"}
            </button>
            <button
              type="button"
              className="linea-selection-popover-btn"
              onMouseDown={(e) => {
                e.preventDefault();
                setNoteComposer({
                  selection: selectedPassage,
                  rect: selectionRect,
                  value: existingSelectionAnnotation?.note ?? "",
                });
                setSelectionRect(null);
              }}
            >
              <NotebookPen size={12} /> {existingSelectionAnnotation?.note ? "Edit note" : "Add note"}
            </button>
            <button
              type="button"
              className="linea-selection-popover-btn"
              onMouseDown={(e) => {
                e.preventDefault();
                onCopySelection(selectedPassage);
                setCopyState("done");
              }}
            >
              {copyState === "done" ? <Check size={12} /> : <Copy size={12} />}
              {copyState === "done" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>,
        window.document.body,
      )}

      {explanationCard && createPortal(
        <div
          className="linea-selection-popover linea-selection-note-popover"
          style={{
            top: `${explanationCard.rect.top - 12}px`,
            left: `${explanationCard.rect.left + explanationCard.rect.width / 2}px`,
          }}
        >
          <div className="linea-selection-note-card linea-selection-explain-card">
            <div className="linea-selection-note-kicker">
              <Sparkles size={12} />
              Explain selection
            </div>
            <div className="linea-selection-note-snippet">
              {snippetText(explanationCard.selection.text, 140)}
            </div>
            {explanationCard.status === "loading" ? (
              <div className="linea-selection-explain-state">
                <LoaderCircle size={16} className="animate-spin" />
                <span>Reading the passage and drafting an explanation…</span>
              </div>
            ) : explanationCard.status === "error" ? (
              <div className="linea-selection-explain-error">
                {explanationCard.error}
              </div>
            ) : (
              <div className="linea-selection-explain-body">
                {explanationCard.explanation}
              </div>
            )}
            <div className="linea-selection-note-actions">
              <button
                type="button"
                className="linea-btn-secondary linea-btn-icon"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setExplanationCard(null);
                }}
              >
                Close
              </button>
              {explanationCard.status === "done" ? (
                <>
                  <button
                    type="button"
                    className="linea-btn-secondary linea-btn-icon"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      try {
                        await navigator.clipboard.writeText(explanationCard.explanation);
                      } catch {
                        // Ignore clipboard failures here.
                      }
                    }}
                  >
                    <Copy size={12} /> Copy answer
                  </button>
                  <button
                    type="button"
                    className="linea-btn-secondary linea-btn-icon"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      try {
                        await navigator.clipboard.writeText(explanationCard.selection.text);
                      } catch {
                        // Ignore clipboard failures here.
                      }
                      window.open(buildResearchLink("chatgpt", explanationCard.selection.text), "_blank", "noopener,noreferrer");
                    }}
                  >
                    <Sparkles size={12} /> ChatGPT
                  </button>
                  <button
                    type="button"
                    className="linea-btn-secondary linea-btn-icon"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      try {
                        await navigator.clipboard.writeText(explanationCard.selection.text);
                      } catch {
                        // Ignore clipboard failures here.
                      }
                      window.open(buildResearchLink("gemini", explanationCard.selection.text), "_blank", "noopener,noreferrer");
                    }}
                  >
                    <Sparkles size={12} /> Gemini
                  </button>
                  <button
                    type="button"
                    className="linea-btn-secondary linea-btn-icon"
                    onMouseDown={async (e) => {
                      e.preventDefault();
                      window.open(buildResearchLink("google", explanationCard.selection.text), "_blank", "noopener,noreferrer");
                    }}
                  >
                    <ArrowRight size={12} /> Search web
                  </button>
                </>
              ) : null}
            </div>
            {explanationCard.model ? (
              <div className="linea-selection-explain-meta">
                {[
                  explanationCard.provider,
                  explanationCard.model,
                  explanationCard.usage
                    ? `${formatCount(explanationCard.usage.inputTokens)} in · ${formatCount(explanationCard.usage.outputTokens)} out`
                    : null,
                ].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>
        </div>,
        window.document.body,
      )}

      {noteComposer && createPortal(
        <div
          className="linea-selection-popover linea-selection-note-popover"
          style={{
            top: `${noteComposer.rect.top - 12}px`,
            left: `${noteComposer.rect.left + noteComposer.rect.width / 2}px`,
          }}
        >
          <div className="linea-selection-note-card">
            <div className="linea-selection-note-kicker">
              <NotebookPen size={12} />
              Note on selection
            </div>
            <div className="linea-selection-note-snippet">
              {snippetText(noteComposer.selection.text, 120)}
            </div>
            <textarea
              value={noteComposer.value}
              onChange={(event) => {
                const value = event.target.value;
                setNoteComposer((current) => (current ? { ...current, value } : current));
              }}
              rows={4}
              className="linea-selection-note-input"
              placeholder="Add a note about this passage..."
              autoFocus
            />
            <div className="linea-selection-note-actions">
              <button
                type="button"
                className="linea-btn-secondary linea-btn-icon"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setNoteComposer(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="linea-btn linea-btn-icon"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const saved = onSaveMarginalia(noteComposer.selection, {
                    kind: "note",
                    note: noteComposer.value,
                  });
                  if (saved) {
                    onSelectMarginalia(saved.id);
                  }
                  closeSelectionUi();
                }}
              >
                Save note
              </button>
            </div>
          </div>
        </div>,
        window.document.body,
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
  const [browserLocation, setBrowserLocation] = useState(readBrowserLocation);
  const [document, setDocument] = useState<ReaderDocument | null>(initialDocument);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<ReaderSettings>(defaultReaderSettings);
  const [readerLayoutMode, setReaderLayoutMode] = useState<ReaderLayoutMode>("text");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [selectedPassage, setSelectedPassage] = useState<ReaderTextSelection | null>(null);
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(null);
  const [selectedMarginaliaId, setSelectedMarginaliaId] = useState<string | null>(null);
  const [marginalia, setMarginalia] = useState<ReaderMarginalia[]>([]);
  const [expandPage, setExpandPage] = useState<number | null>(null);
  const [ocrByPage, setOcrByPage] = useState<
    Record<number, { state: "idle" | "probing" | "running" | "completed" | "empty" | "failed"; message?: string }>
  >({});

  const { doc: pdfDoc } = usePdfDocument(pdfData);
  const autoLoadedRef = useRef<string | null>(null);
  const attemptedOcrRef = useRef<Set<string>>(new Set());
  const loadSequenceRef = useRef(0);

  const currentPage = useMemo(
    () => document?.pages.find((p) => p.pageNumber === selectedPage) ?? null,
    [document, selectedPage],
  );
  const marginaliaStorageKey = useMemo(
    () => (document ? getDocumentAnnotationStorageKey(document) : null),
    [document],
  );
  const currentPageMarginalia = useMemo(
    () =>
      currentPage
        ? marginalia.filter((entry) => entry.pageNumber === currentPage.pageNumber)
        : [],
    [marginalia, currentPage],
  );
  const managedAccess = useLineaAccessSnapshot();
  const isReaderRoute = isReaderPath(browserLocation.pathname);
  const isDemoRoute = isDemoPath(browserLocation.pathname);
  const isAppRoute = isReaderRoute || isDemoRoute;
  const authGateEnabled =
    managedAccess.snapshot.enabled &&
    managedAccess.snapshot.clerkConfigured &&
    Boolean(getClerkPublishableKey());
  const isAttentionDemoDocument = Boolean(
    document?.source?.url?.includes("attention-is-all-you-need.pdf") ||
    document?.fileName.toLowerCase().includes("attention is all you need"),
  );
  const allowPublicDemoVoicePlayback = isDemoRoute && isAttentionDemoDocument;
  const isAnonymousPublicDemo =
    allowPublicDemoVoicePlayback && managedAccess.snapshot.access.status === "signed-out";
  const shouldRedirectToSignIn =
    !managedAccess.loading &&
    authGateEnabled &&
    managedAccess.snapshot.access.status === "signed-out" &&
    isReaderRoute;

  const voice = useVoiceConsole({
    pages: document?.pages ?? [],
    selectedPage,
    onSelectPage: setSelectedPage,
    allowUnavailableProviderPlayback: allowPublicDemoVoicePlayback,
    preferAlignedPageClipPlayback: allowPublicDemoVoicePlayback,
  });
  const hasDirectVoicePlayback = voice.providers.some((provider) => provider.available);
  const pagePlaybackEnabled = Boolean(document) && (allowPublicDemoVoicePlayback || hasDirectVoicePlayback);
  const paragraphPlaybackEnabled = pagePlaybackEnabled;
  const selectionPlaybackEnabled = pagePlaybackEnabled;
  const playbackBlockedReason = !pagePlaybackEnabled
    ? isDemoRoute && managedAccess.snapshot.access.status === "signed-out"
      ? "This sample does not include public cached voice yet. Sign in to use voice playback."
      : managedAccess.snapshot.enabled && managedAccess.snapshot.access.status === "signed-out"
        ? "Sign in to use managed voice and alignment."
        : managedAccess.snapshot.enabled && !managedAccess.snapshot.localCredentialsEnabled
          ? "Voice playback is unavailable for this account on this deployment."
          : "Add an API key to enable voice playback."
    : "";
  const playbackBlockedLabel = getVoiceBlockedLabel(playbackBlockedReason);
  const selectionPlaybackLabel = isAnonymousPublicDemo ? "Play paragraph" : "Read selection";
  const explainEnabled = managedAccess.snapshot.enabled
    ? managedAccess.snapshot.access.status === "active"
    : true;
  const explainActionLabel = getExplainBlockedLabel(managedAccess.snapshot);

  const selectedParagraph = useMemo(
    () => currentPage?.paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) ?? null,
    [currentPage, selectedParagraphId],
  );

  const syncBrowserLocation = useCallback(() => {
    setBrowserLocation(readBrowserLocation());
  }, []);

  const navigateTo = useCallback((url: string, mode: "push" | "replace" = "push") => {
    if (typeof window === "undefined") {
      return;
    }

    if (mode === "replace") {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
    }

    syncBrowserLocation();
  }, [syncBrowserLocation]);

  const resetReaderState = useCallback(() => {
    loadSequenceRef.current += 1;
    voice.stopSpeaking();
    voice.stopListening();
    attemptedOcrRef.current = new Set();
    setDocument(null);
    setPdfData(null);
    setSelectedPage(1);
    setSelectedParagraphId(null);
    setSelectedMarginaliaId(null);
    setSelectedPassage(null);
    setExpandPage(null);
    setLoading(false);
    setLoadingSample(null);
    setProgress(null);
    setOcrByPage({});
    setError("");
  }, [voice]);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!marginaliaStorageKey) {
      setMarginalia([]);
      return;
    }

    const saved = window.localStorage.getItem(marginaliaStorageKey);
    if (!saved) {
      setMarginalia([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as ReaderMarginalia[];
      setMarginalia(Array.isArray(parsed) ? parsed : []);
    } catch {
      window.localStorage.removeItem(marginaliaStorageKey);
      setMarginalia([]);
    }
  }, [marginaliaStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !marginaliaStorageKey) {
      return;
    }

    window.localStorage.setItem(marginaliaStorageKey, JSON.stringify(marginalia));
  }, [marginaliaStorageKey, marginalia]);

  useEffect(() => {
    if (!selectedMarginaliaId) {
      return;
    }

    const stillVisible = currentPageMarginalia.some((entry) => entry.id === selectedMarginaliaId);
    if (!stillVisible) {
      setSelectedMarginaliaId(null);
    }
  }, [currentPageMarginalia, selectedMarginaliaId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedLayout = window.localStorage.getItem("linea:reader-layout-mode");
    if (savedLayout === "text" || savedLayout === "split") {
      setReaderLayoutMode(savedLayout);
    }
    const savedSidebarWidth = Number(window.localStorage.getItem("linea:sidebar-width"));
    if (Number.isFinite(savedSidebarWidth) && savedSidebarWidth >= SIDEBAR_WIDTH_MIN) {
      setSidebarWidth(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, savedSidebarWidth)));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("linea:reader-layout-mode", readerLayoutMode);
  }, [readerLayoutMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("linea:sidebar-width", String(Math.round(sidebarWidth)));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = () => {
      syncBrowserLocation();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [syncBrowserLocation]);

  const handleFile = async (file: File) => {
    if (authGateEnabled && managedAccess.snapshot.access.status === "signed-out") {
      if (typeof window !== "undefined") {
        window.location.assign(getReaderPath());
      }
      return;
    }

    if (typeof window !== "undefined" && !isReaderRoute) {
      navigateTo(getReaderPath());
    }

    const loadSequence = ++loadSequenceRef.current;
    setLoading(true);
    setError("");
    setProgress(null);
    setOcrByPage({});
    attemptedOcrRef.current = new Set();
    voice.stopSpeaking();
    voice.stopListening();
    try {
      const fileData = new Uint8Array(await file.arrayBuffer());
      if (loadSequence !== loadSequenceRef.current) {
        return;
      }
      setPdfData(fileData);
      const doc = await loadReaderDocument(file, setProgress);
      if (loadSequence !== loadSequenceRef.current) {
        return;
      }
      startTransition(() => {
        setDocument(doc);
        setSelectedPage(1);
        setSelectedParagraphId(null);
      });
    } catch (e) {
      if (loadSequence === loadSequenceRef.current) {
        setError(e instanceof Error ? e.message : "The PDF could not be parsed.");
      }
    } finally {
      if (loadSequence === loadSequenceRef.current) {
        setLoading(false);
      }
    }
  };

  const loadSamplePdf = async (
    url: string,
    name: string,
    options?: { localPath?: string },
  ) => {
    const loadSequence = ++loadSequenceRef.current;
    setLoading(true);
    setLoadingSample(name);
    setError("");
    setProgress(null);
    setOcrByPage({});
    attemptedOcrRef.current = new Set();
    voice.stopSpeaking();
    voice.stopListening();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
      const buffer = await response.arrayBuffer();
      const fileData = new Uint8Array(buffer);
      if (loadSequence !== loadSequenceRef.current) {
        return;
      }
      setPdfData(fileData);
      const file = new File([buffer], name.endsWith(".pdf") ? name : `${name}.pdf`, {
        type: "application/pdf",
      });
      const doc = await loadReaderDocument(file, setProgress, {
        url,
        localPath: options?.localPath,
      });
      if (loadSequence !== loadSequenceRef.current) {
        return;
      }
      startTransition(() => {
        setDocument(doc);
        setSelectedPage(1);
        setSelectedParagraphId(null);
      });
    } catch (e) {
      if (loadSequence === loadSequenceRef.current) {
        setError(e instanceof Error ? e.message : "Failed to load sample PDF.");
      }
    } finally {
      if (loadSequence === loadSequenceRef.current) {
        setLoading(false);
        setLoadingSample(null);
      }
    }
  };

  const openDemo = useCallback((sampleFile?: (typeof FEATURED_DEMO_OPTIONS)[number]["file"]) => {
    const demoPath = getDemoPath(sampleFile);
    autoLoadedRef.current = demoPath;
    navigateTo(demoPath);
    const targetFile = sampleFile ?? "attention-is-all-you-need.pdf";
    const selectedSample = SAMPLE_DOCUMENTS.find((sample) => sample.file === targetFile);
    void loadSamplePdf(
      `${getBasePath()}/samples/${targetFile}`,
      selectedSample?.label ?? "White Paper",
      { localPath: selectedSample?.localPath },
    );
  }, [navigateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const goHome = useCallback(() => {
    navigateTo(getBasePath() || "/");
  }, [navigateTo]);

  useEffect(() => {
    if (!isAppRoute) {
      autoLoadedRef.current = null;
      if (document || pdfData || loading || loadingSample || progress || error || expandPage !== null) {
        resetReaderState();
      }
      return;
    }

    if (!isDemoRoute) {
      autoLoadedRef.current = null;
      return;
    }

    if (shouldRedirectToSignIn) {
      return;
    }

    const routeKey = `${browserLocation.pathname}${browserLocation.search}`;
    if (autoLoadedRef.current === routeKey) {
      return;
    }

    autoLoadedRef.current = routeKey;
    const sampleFile = getDemoSampleFile(browserLocation.search);
    const sample = SAMPLE_DOCUMENTS.find((entry) => entry.file === sampleFile);
    void loadSamplePdf(`${getBasePath()}/samples/${sampleFile}`, sample?.label ?? "White Paper", {
      localPath: sample?.localPath,
    });
  }, [
    browserLocation.pathname,
    browserLocation.search,
    document,
    error,
    expandPage,
    isAppRoute,
    isDemoRoute,
    loading,
    loadingSample,
    pdfData,
    progress,
    resetReaderState,
    shouldRedirectToSignIn,
  ]);

  // Auto-load sample PDF on explicit demo route.
  useEffect(() => {
    if (typeof window === "undefined") return;
    syncBrowserLocation();
  }, [syncBrowserLocation]);

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
    if (isAnonymousPublicDemo && currentPage) {
      const targetParagraph = currentPage.paragraphs.find(
        (paragraph) =>
          !paragraph.skip &&
          (
            selectedPassage.paragraphIds.includes(paragraph.id) ||
            paragraph.id === selectedPassage.paragraphId
          ),
      );

      if (targetParagraph) {
        voice.speakFromParagraph(currentPage, targetParagraph);
      }

      return;
    }
    voice.speakSelection(selectedPassage, currentPage);
  }, [voice, selectedPassage, currentPage, isAnonymousPublicDemo]);

  const handleExplainSelection = useCallback(async (selection: ReaderTextSelection, page: ReaderPage) => {
    const firstParagraph =
      selection.paragraphIds.length > 0
        ? page.paragraphs.find((entry) => selection.paragraphIds.includes(entry.id)) ?? null
        : selection.paragraphId
          ? page.paragraphs.find((entry) => entry.id === selection.paragraphId) ?? null
          : null;

    return fetchLineaExplanation({
      text: selection.text,
      contextText: firstParagraph?.text,
      documentTitle: document?.fileName,
      pageNumber: page.pageNumber,
    });
  }, [document?.fileName]);

  const upsertMarginalia = useCallback((
    selection: ReaderTextSelection,
    update:
      | { kind: "highlight" }
      | { kind: "note"; note: string }
      | { kind: "explanation"; explanation: LineaExplainResponse },
  ) => {
    if (!currentPage) {
      return null;
    }

    const range = resolveSelectionRange(selection, currentPage);
    if (!range) {
      return null;
    }

    const now = new Date().toISOString();
    const nextId = `${update.kind}:${currentPage.pageNumber}:${range.startCharIndex}:${range.endCharIndex}`;
    let savedEntry: ReaderMarginalia | null = null;

    setMarginalia((current) => {
      const index = current.findIndex(
        (entry) => entry.id === nextId,
      );

      if (index >= 0) {
        const existing = current[index]!;
        const next = [...current];
        const merged: ReaderMarginalia = {
          ...existing,
          kind: update.kind,
          text: selection.text,
          note:
            update.kind === "note"
              ? update.note.trim() || undefined
              : update.kind === "highlight"
                ? undefined
                : existing.note,
          explanation:
            update.kind === "explanation"
              ? update.explanation.explanation
              : existing.explanation,
          provider:
            update.kind === "explanation"
              ? update.explanation.provider
              : existing.provider ?? null,
          model:
            update.kind === "explanation"
              ? update.explanation.model
              : existing.model ?? null,
          usage:
            update.kind === "explanation"
              ? update.explanation.usage
              : existing.usage ?? null,
          updatedAt: now,
        };
        next[index] = merged;
        savedEntry = merged;
        return next;
      }

      const created: ReaderMarginalia = {
        id: nextId,
        kind: update.kind,
        pageNumber: currentPage.pageNumber,
        startCharIndex: range.startCharIndex,
        endCharIndex: range.endCharIndex,
        text: selection.text,
        note: update.kind === "note" ? update.note.trim() || undefined : undefined,
        explanation: update.kind === "explanation" ? update.explanation.explanation : undefined,
        provider: update.kind === "explanation" ? update.explanation.provider : null,
        model: update.kind === "explanation" ? update.explanation.model : null,
        usage: update.kind === "explanation" ? update.explanation.usage : null,
        createdAt: now,
        updatedAt: now,
      };
      savedEntry = created;
      return [...current, created];
    });

    return savedEntry;
  }, [currentPage]);

  const handleCopySelection = useCallback(async (selection: ReaderTextSelection) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selection.text);
    } catch {
      // Ignore clipboard failures and leave the selection intact.
    }
  }, []);

  const handlePlayPage = useCallback(() => {
    voice.speakPage(currentPage ?? undefined);
  }, [voice, currentPage]);

  const runOcrForPage = useCallback(async (pageNumber: number, force = false) => {
    if (!document?.source?.localPath) {
      setOcrByPage((current) => ({
        ...current,
        [pageNumber]: {
          state: "failed",
          message: "Local OCR currently requires a local sample path.",
        },
      }));
      return;
    }

    const page = document.pages.find((entry) => entry.pageNumber === pageNumber);
    if (!page) return;

    const key = `${document.loadedAt}:${pageNumber}`;
    if (!force && attemptedOcrRef.current.has(key)) {
      return;
    }

    attemptedOcrRef.current.add(key);
    setOcrByPage((current) => ({ ...current, [pageNumber]: { state: "probing" } }));

    const runtime = await probeFabricRunner();
    if (!runtime) {
      setOcrByPage((current) => ({
        ...current,
        [pageNumber]: {
          state: "failed",
          message: "Fabric Runner is not reachable on localhost.",
        },
      }));
      return;
    }

    try {
      const job = await submitFabricRunnerOcrPageJob(runtime, {
        pdfPath: document.source.localPath,
        page: pageNumber,
        language: "eng",
      });

      setOcrByPage((current) => ({ ...current, [pageNumber]: { state: "running" } }));

      const finalJob = await pollFabricRunnerJob(runtime, job.id);

      if (finalJob.status !== "completed") {
        throw new Error(finalJob.error ?? "OCR job failed");
      }

      const text = finalJob.result?.text?.trim() ?? "";

      if (!text) {
        setOcrByPage((current) => ({
          ...current,
          [pageNumber]: {
            state: "empty",
            message: "OCR completed with no text result.",
          },
        }));
        return;
      }

      setDocument((current) => {
        if (!current) return current;
        const pages = current.pages.map((entry) =>
          entry.pageNumber === pageNumber
            ? buildReaderPageFromText(
                pageNumber,
                entry.width,
                entry.height,
                text,
                entry.title,
              )
            : entry,
        );
        const totalWords = pages.reduce((sum, entry) => sum + entry.wordCount, 0);
        return {
          ...current,
          totalWords,
          estimatedMinutes: Math.max(1, Math.round(totalWords / 155)),
          pages,
        };
      });

      setOcrByPage((current) => ({ ...current, [pageNumber]: { state: "completed" } }));
    } catch (error) {
      setOcrByPage((current) => ({
        ...current,
        [pageNumber]: {
          state: "failed",
          message: error instanceof Error ? error.message : "OCR failed",
        },
      }));
    }
  }, [document]);

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

  const startSidebarResize = useCallback((event: { clientX: number; preventDefault: () => void }) => {
    if (typeof window === "undefined" || window.innerWidth <= 900) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const restore = () => {
      window.document.body.style.cursor = "";
      window.document.body.style.userSelect = "";
    };

    window.document.body.style.cursor = "col-resize";
    window.document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = startWidth + (moveEvent.clientX - startX);
      setSidebarWidth(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, nextWidth)));
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      restore();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }, [sidebarWidth]);

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

  if (shouldRedirectToSignIn) {
    return <ManagedAuthRedirect />;
  }

  /* ── no document ── */

  if (!document) {
    return (
      <Landing
        onFile={handleFile}
        onOpenDemo={openDemo}
        loading={loading}
        loadingSample={loadingSample}
        progress={progress}
        error={error}
        theme={theme}
        toggleTheme={toggleTheme}
        accessSnapshot={managedAccess.snapshot}
      />
    );
  }

  /* ── document loaded ── */

  return (
    <div
      className="linea-page linea-bg-document linea-frame"
      style={{ ["--linea-sidebar-width" as string]: `${sidebarWidth}px` }}
    >
      <Header
        document={document}
        onGoHome={goHome}
        onUploadClick={() => fileInputRef.current?.click()}
        onLoadSample={(url, name, options) => void loadSamplePdf(url, name, options)}
        readerLayoutMode={readerLayoutMode}
        onReaderLayoutModeChange={setReaderLayoutMode}
        loadingSample={loadingSample}
        theme={theme}
        toggleTheme={toggleTheme}
        settings={settings}
        onSettingsChange={setSettings}
        voice={voice}
        documentProgress={documentProgress}
        accessSnapshot={managedAccess.snapshot}
        accessLoading={managedAccess.loading}
        accessError={managedAccess.error}
      />

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
        playbackRangePageNumber={voice.playbackRangePageNumber}
        playbackParagraphStateById={voice.playbackParagraphStateById}
        onSelectPage={setSelectedPage}
        onExpand={setExpandPage}
      />

      <div className="linea-sidebar-resize">
        <button
          type="button"
          className="linea-sidebar-resize-handle"
          onPointerDown={startSidebarResize}
          onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          aria-label="Resize page sidebar"
          title="Drag to resize the page sidebar"
        />
      </div>

      <div className="linea-main">
        {error && (
          <div style={{ padding: '0 28px' }}>
            <div className="linea-error">{error}</div>
          </div>
        )}
        {(voice.voiceError || (playbackBlockedReason && isDemoRoute)) && (
          <div style={{ padding: "0 28px" }}>
            <div className="linea-error">
              {voice.voiceError || playbackBlockedReason}
            </div>
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
                hasParagraphSelected={Boolean(selectedParagraph)}
                downloadUrl={voice.activity.audioUrl}
                onPlay={handlePlayPage}
                onPlayParagraph={handlePlaySelectedParagraph}
                onCancelRequest={voice.cancelRequest}
                onPauseOrResume={voice.pauseOrResume}
                onStop={voice.stopSpeaking}
                onReadSelection={handleReadSelection}
                isRequesting={voice.activity.phase === "requesting"}
                requestLabel={voice.activity.label}
                requestDetail={voice.activity.detail}
                requestStage={voice.activity.requestStage ?? null}
                clipProgress={voice.playbackWindow.progress}
                clipElapsedMs={voice.playbackWindow.elapsedMs}
                clipDurationMs={voice.playbackWindow.durationMs}
                clipCurrentWord={voice.playbackWindow.currentWord}
                clipTotalWords={voice.playbackWindow.totalWords}
                onSeekClip={voice.seekPlayback}
                pagePlaybackEnabled={pagePlaybackEnabled}
                paragraphPlaybackEnabled={paragraphPlaybackEnabled}
                selectionPlaybackEnabled={selectionPlaybackEnabled}
                selectionPlaybackLabel={selectionPlaybackLabel}
                playbackBlockedLabel={playbackBlockedLabel}
              />
              <ReaderPanel
                document={document}
                page={currentPage}
                pdfDoc={pdfDoc}
                pageImageDataUrl={null}
                selectedPage={selectedPage}
                readerLayoutMode={readerLayoutMode}
                settings={settings}
                selectedPassage={selectedPassage}
                marginalia={currentPageMarginalia}
                selectedMarginaliaId={selectedMarginaliaId}
                activeParagraphId={voice.activeParagraphId}
                activeTokenRange={voice.activeTokenRange}
                activePageNumber={voice.activePageNumber}
                playbackRangePageNumber={voice.playbackRangePageNumber}
                playbackRangeStartParagraphId={voice.playbackRangeStartParagraphId}
                playbackRangeEndParagraphId={voice.playbackRangeEndParagraphId}
                playbackParagraphStateById={voice.playbackParagraphStateById}
                selectedParagraphId={selectedParagraphId}
                isAudioActive={voice.isSpeaking || voice.isPaused}
                onSelectPage={setSelectedPage}
                onSelectParagraph={setSelectedParagraphId}
                onSelectMarginalia={setSelectedMarginaliaId}
                onSelectText={setSelectedPassage}
                onSeekToChar={voice.seekToCharIndex}
                onPlayPage={handlePlayPage}
                onReadSelection={handleReadSelection}
                explainEnabled={explainEnabled}
                explainActionLabel={explainActionLabel}
                onExplainSelection={handleExplainSelection}
                onSaveMarginalia={upsertMarginalia}
                onCopySelection={handleCopySelection}
                onRunOcr={() => void runOcrForPage(currentPage.pageNumber, true)}
                ocrStatus={ocrByPage[currentPage.pageNumber] ?? null}
                selectionPlaybackEnabled={selectionPlaybackEnabled}
                selectionPlaybackLabel={selectionPlaybackLabel}
                playPageEnabled={pagePlaybackEnabled}
                playPageLabel={playbackBlockedLabel}
              />
            </>
          )}
        </div>

      {currentPage && (
        <ContextPanel
          document={document}
          page={currentPage}
          voice={voice}
          marginalia={currentPageMarginalia}
          selectedPassage={selectedPassage}
          selectedParagraph={selectedParagraph}
          selectedParagraphId={selectedParagraphId}
          selectedMarginaliaId={selectedMarginaliaId}
          selectedPage={selectedPage}
          onPlayPage={handlePlayPage}
          playPageEnabled={pagePlaybackEnabled}
          playPageLabel={playbackBlockedLabel}
          onSelectParagraph={setSelectedParagraphId}
          onSelectMarginalia={setSelectedMarginaliaId}
        />
      )}

      {expandPage !== null && pdfDoc && (
        <PdfExpandOverlay
          doc={pdfDoc}
          pageNumber={expandPage}
          totalPages={document.pageCount}
          onPlayPage={handlePlayPage}
          playPageEnabled={pagePlaybackEnabled}
          playPageLabel={playbackBlockedLabel}
          onClose={() => setExpandPage(null)}
          onNavigate={(p) => {
            setExpandPage(p);
            setSelectedPage(p);
          }}
        />
      )}
      <DevInspectorSidebar />
    </div>
  );
}
