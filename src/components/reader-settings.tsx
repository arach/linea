import { Palette, Type } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ReaderFont,
  type ReaderSettings,
  type ReaderTheme,
  readerFonts,
  readerThemes,
} from "@/lib/reader-presentation";
import { cn } from "@/lib/utils";

type ReaderSettingsProps = {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
};

export function ReaderSettings({ settings, onChange }: ReaderSettingsProps) {
  const update = <Key extends keyof ReaderSettings>(key: Key, value: ReaderSettings[Key]) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <Card className="overflow-hidden bg-white/4">
      <CardHeader className="gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <Palette className="size-4 text-primary" />
          Reader settings
        </div>
        <CardTitle className="text-lg">Presentation</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Palette className="size-3.5" />
            Theme
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(readerThemes) as Array<[ReaderTheme, (typeof readerThemes)[ReaderTheme]]>).map(
              ([theme, meta]) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => update("theme", theme)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-sm transition-colors",
                    settings.theme === theme
                      ? "border-primary/50 bg-primary/14 text-foreground"
                      : "border-border/60 bg-white/5 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {meta.label}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Type className="size-3.5 text-primary" />
            Font
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(readerFonts) as Array<[ReaderFont, (typeof readerFonts)[ReaderFont]]>).map(
              ([font, meta]) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => update("font", font)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-sm transition-colors",
                    meta.className,
                    settings.font === font
                      ? "border-primary/50 bg-primary/14 text-foreground"
                      : "border-border/60 bg-white/5 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {meta.label}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span>Text size</span>
            <span>{settings.fontSize}px</span>
          </div>
          <input
            type="range"
            min="16"
            max="30"
            step="1"
            value={settings.fontSize}
            onChange={(event) => update("fontSize", Number(event.target.value))}
            className="h-10 w-full accent-[var(--primary)]"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span>Line height</span>
            <span>{settings.lineHeight.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="1.4"
            max="2"
            step="0.02"
            value={settings.lineHeight}
            onChange={(event) => update("lineHeight", Number(event.target.value))}
            className="h-10 w-full accent-[var(--primary)]"
          />
        </div>
      </CardContent>
    </Card>
  );
}
