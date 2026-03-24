export type ReaderTheme = "paper" | "night" | "mist";
export type ReaderFont = "serif" | "sans" | "mono";

export type ReaderSettings = {
  theme: ReaderTheme;
  font: ReaderFont;
  fontSize: number;
  lineHeight: number;
};

export const defaultReaderSettings: ReaderSettings = {
  theme: "paper",
  font: "serif",
  fontSize: 21,
  lineHeight: 1.72,
};

export const readerThemes = {
  paper: {
    label: "Paper",
    surfaceClass:
      "border-[#ded6c8] bg-[#f6f1e6] text-[#1b1712] shadow-[0_28px_80px_-42px_rgba(16,14,10,0.28)]",
    chromeClass: "border-[#d8d0c1] bg-[#fffaf0]/82 text-[#433a30]",
    mutedClass: "text-[#6d6256]",
    titleClass: "text-[#19140f]",
    activeParagraphClass: "bg-[#fff9ec]/72 ring-1 ring-[#ebca76]/26",
  },
  night: {
    label: "Night",
    surfaceClass:
      "border-[#253042] bg-[#0f1724] text-[#f3eee4] shadow-[0_28px_80px_-42px_rgba(1,4,12,0.7)]",
    chromeClass: "border-[#263143] bg-[#111b2a]/82 text-[#9faec5]",
    mutedClass: "text-[#9aa8bd]",
    titleClass: "text-[#fcf7f0]",
    activeParagraphClass: "bg-[#172133]/72 ring-1 ring-[#7aa2ff]/20",
  },
  mist: {
    label: "Mist",
    surfaceClass:
      "border-[#cfd7e2] bg-[#edf2f7] text-[#162233] shadow-[0_28px_80px_-42px_rgba(17,30,52,0.22)]",
    chromeClass: "border-[#ccd5e1] bg-[#f7fbff]/84 text-[#4c5c73]",
    mutedClass: "text-[#5b6a80]",
    titleClass: "text-[#122033]",
    activeParagraphClass: "bg-[#ffffff]/78 ring-1 ring-[#95b9ff]/28",
  },
} as const satisfies Record<
  ReaderTheme,
  {
    label: string;
    surfaceClass: string;
    chromeClass: string;
    mutedClass: string;
    titleClass: string;
    activeParagraphClass: string;
  }
>;

export const readerFonts = {
  serif: {
    label: "Serif",
    className: "font-serif",
  },
  sans: {
    label: "Sans",
    className: "font-sans",
  },
  mono: {
    label: "Mono",
    className: "font-mono",
  },
} as const satisfies Record<
  ReaderFont,
  {
    label: string;
    className: string;
  }
>;
