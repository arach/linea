import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "tactical" | "soft" | "big-read";

const STORAGE_KEY = "linea:theme";
const URL_THEMES = new Set<Theme>(["tactical", "soft", "big-read"]);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getUrlTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("theme");
  if (param && URL_THEMES.has(param as Theme)) return param as Theme;
  return null;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const urlTheme = getUrlTheme();
    if (urlTheme) {
      setThemeState(urlTheme);
      applyTheme(urlTheme);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    const nextTheme =
      stored === "light" || stored === "dark"
        ? stored
        : getSystemTheme();

    setThemeState(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // Listen for system preference changes (only if no explicit choice)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const next = mq.matches ? "dark" : "light";
        setThemeState(next);
        applyTheme(next);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return { theme, setTheme, toggle } as const;
}
