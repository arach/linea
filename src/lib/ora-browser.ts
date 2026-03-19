// Browser-safe re-export of @arach/ora.
//
// The ora package bundles server-only code (worker proxy, HTTP backend) that
// imports Node built-ins (crypto, child_process, fs, http, os, path). Vite
// externalises these for browser builds, which throws at access time and kills
// React hydration. This module re-implements the tiny slice Linea actually
// uses: OraPlaybackTracker and its supporting types / helpers.
//
// Source: ora/src/tracker.ts, ora/src/tokenize.ts, ora/src/timeline.ts

/* ── types ── */

export type OraProviderId = "openai" | "elevenlabs" | "system" | (string & {});
export type OraAudioFormat = "mp3" | "wav" | "aac" | "opus";
export type OraVoice = {
  id: string;
  label: string;
  provider: OraProviderId;
  locale?: string;
  styles?: string[];
  tags?: string[];
  previewText?: string;
  previewUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type OraPlaybackSegment = {
  id: string;
  start: number;
  end: number;
  label?: string;
};

type OraTextToken = {
  index: number;
  text: string;
  start: number;
  end: number;
  isWord: boolean;
};

type OraTimedToken = OraTextToken & {
  startMs: number;
  endMs: number;
  weightMs: number;
};

type OraPlaybackSource = "idle" | "boundary" | "provider-mark" | "estimated-clock";

type OraPlaybackSnapshot = {
  source: OraPlaybackSource;
  currentTimeMs: number;
  currentCharIndex: number;
  progress: number;
  token: OraTextToken | null;
  tokenIndex: number;
  segment: OraPlaybackSegment | null;
  segmentIndex: number;
};

type OraPlaybackTrackerOptions = {
  text: string;
  tokens?: OraTextToken[];
  timeline?: OraTimedToken[];
  segments?: OraPlaybackSegment[];
};

/* ── helpers ── */

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const tokenPattern = /\p{L}[\p{L}\p{N}''\u2010-\u2014-]*|\p{N}+|[^\s]/gu;

function tokenizeText(text: string): OraTextToken[] {
  const tokens: OraTextToken[] = [];
  for (const match of text.matchAll(tokenPattern)) {
    const raw = match[0] ?? "";
    const start = match.index ?? 0;
    const end = start + raw.length;
    tokens.push({
      index: tokens.length,
      text: raw,
      start,
      end,
      isWord: /[\p{L}\p{N}]/u.test(raw),
    });
  }
  return tokens;
}

function findTokenAtCharIndex(tokens: OraTextToken[], charIndex: number) {
  if (tokens.length === 0) return null;
  const ci = Math.max(0, charIndex);
  const exact = tokens.find((t) => ci >= t.start && ci < t.end);
  if (exact) return exact;
  let last: OraTextToken | null = null;
  for (const t of tokens) {
    if (t.start <= ci) last = t;
  }
  return last ?? tokens[0];
}

function getTokenWeightMs(token: OraTextToken, minMs: number, pauseMs: number) {
  const length = token.isWord ? token.text.length * 38 : 0;
  const punct = /^[,.;:!?)]$/.test(token.text) ? pauseMs : 0;
  const quote = /^["""''']$/.test(token.text) ? pauseMs * 0.35 : 0;
  return Math.max(minMs, length + punct + quote);
}

function createEstimatedTimeline(options: {
  text: string;
  tokens?: OraTextToken[];
  durationMs?: number;
  charactersPerSecond?: number;
  minimumTokenMs?: number;
  punctuationPauseMs?: number;
}): OraTimedToken[] {
  const tokens = options.tokens ?? tokenizeText(options.text);
  const minMs = options.minimumTokenMs ?? 80;
  const pauseMs = options.punctuationPauseMs ?? 90;
  const cps = options.charactersPerSecond ?? 14;
  if (tokens.length === 0) return [];
  const fallback = Math.max(1, (options.text.length / cps) * 1000);
  const target = options.durationMs ?? fallback;
  const raw = tokens.map((t) => getTokenWeightMs(t, minMs, pauseMs));
  const total = raw.reduce((s, v) => s + v, 0) || target;
  const scale = target / total;
  let cursor = 0;
  return tokens.map((t, i) => {
    const w = raw[i]! * scale;
    const startMs = cursor;
    const endMs = startMs + w;
    cursor = endMs;
    return { ...t, startMs, endMs, weightMs: w };
  });
}

function findTimedTokenAtTime(timeline: OraTimedToken[], timeMs: number) {
  if (timeline.length === 0) return null;
  const t = Math.max(0, timeMs);
  const exact = timeline.find((tok) => t >= tok.startMs && t < tok.endMs);
  if (exact) return exact;
  let last: OraTimedToken | null = null;
  for (const tok of timeline) {
    if (tok.startMs <= t) last = tok;
  }
  return last ?? timeline[0];
}

function findSegmentAtCharIndex(segments: OraPlaybackSegment[], charIndex: number) {
  if (segments.length === 0) return { segment: null, segmentIndex: -1 };
  const si = segments.findIndex((s) => charIndex >= s.start && charIndex < s.end);
  if (si >= 0) return { segment: segments[si]!, segmentIndex: si };
  let fi = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]!.start <= charIndex) fi = i;
  }
  if (fi >= 0) return { segment: segments[fi]!, segmentIndex: fi };
  return { segment: segments[0] ?? null, segmentIndex: segments[0] ? 0 : -1 };
}

/* ── OraPlaybackTracker ── */

export class OraPlaybackTracker {
  text: string;
  tokens: OraTextToken[];
  segments: OraPlaybackSegment[];
  timeline: OraTimedToken[];
  currentTimeMs = 0;
  currentCharIndex = 0;
  source: OraPlaybackSource = "idle";

  constructor(options: OraPlaybackTrackerOptions) {
    this.text = options.text;
    this.tokens = options.tokens ?? tokenizeText(options.text);
    this.segments = [...(options.segments ?? [])].sort((a, b) => a.start - b.start);
    this.timeline =
      options.timeline ??
      createEstimatedTimeline({ text: options.text, tokens: this.tokens });
  }

  reset(): OraPlaybackSnapshot {
    this.currentTimeMs = 0;
    this.currentCharIndex = 0;
    this.source = "idle";
    return this.snapshot();
  }

  updateFromBoundary(charIndex: number, timeMs = this.currentTimeMs): OraPlaybackSnapshot {
    this.source = "boundary";
    this.currentCharIndex = clamp(charIndex, 0, this.text.length);
    this.currentTimeMs = Math.max(0, timeMs);
    return this.snapshot();
  }

  updateFromProviderMark(charIndex: number, timeMs = this.currentTimeMs): OraPlaybackSnapshot {
    this.source = "provider-mark";
    this.currentCharIndex = clamp(charIndex, 0, this.text.length);
    this.currentTimeMs = Math.max(0, timeMs);
    return this.snapshot();
  }

  updateFromClock(timeMs: number): OraPlaybackSnapshot {
    this.source = "estimated-clock";
    this.currentTimeMs = Math.max(0, timeMs);
    const active = findTimedTokenAtTime(this.timeline, this.currentTimeMs);
    this.currentCharIndex = active?.start ?? 0;
    return this.snapshot();
  }

  updateFromProgress(progress: number): OraPlaybackSnapshot {
    const total = this.timeline[this.timeline.length - 1]?.endMs ?? 0;
    return this.updateFromClock(total * clamp(progress, 0, 1));
  }

  snapshot(): OraPlaybackSnapshot {
    const token =
      this.source === "estimated-clock"
        ? findTimedTokenAtTime(this.timeline, this.currentTimeMs)
        : findTokenAtCharIndex(this.tokens, this.currentCharIndex);
    const tokenIndex = token?.index ?? -1;
    const { segment, segmentIndex } = findSegmentAtCharIndex(
      this.segments,
      this.currentCharIndex,
    );
    const totalMs = this.timeline[this.timeline.length - 1]?.endMs ?? 0;
    const progress =
      this.source === "estimated-clock" && totalMs > 0
        ? clamp(this.currentTimeMs / totalMs, 0, 1)
        : this.text.length > 0
          ? clamp(this.currentCharIndex / this.text.length, 0, 1)
          : 0;
    return {
      source: this.source,
      currentTimeMs: this.currentTimeMs,
      currentCharIndex: this.currentCharIndex,
      progress,
      token: token ?? null,
      tokenIndex,
      segment,
      segmentIndex,
    };
  }
}
