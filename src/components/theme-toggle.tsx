"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "super-dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={dark ? "Use night theme" : "Use black theme"}
    >
      {dark ? <SunMedium /> : <MoonStar />}
    </Button>
  );
}
