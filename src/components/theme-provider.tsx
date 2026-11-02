"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "super-dark";

const STORAGE_KEY = "voltdesk-theme";

const ThemeContext = createContext<{
  theme: ThemeMode;
  toggleTheme: () => void;
} | null>(null);

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove("dark", "super-dark");
  root.classList.add(theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const next = stored === "super-dark" ? "super-dark" : "dark";
      setTheme(next);
      applyTheme(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "super-dark" : "dark"));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
