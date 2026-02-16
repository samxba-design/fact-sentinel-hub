import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ThemePalette = "midnight" | "arctic" | "ember" | "forest";
export type ThemeDensity = "compact" | "default" | "comfortable";

interface ThemeContextValue {
  palette: ThemePalette;
  density: ThemeDensity;
  setPalette: (p: ThemePalette) => void;
  setDensity: (d: ThemeDensity) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const PALETTE_KEY = "sentinel-palette";
const DENSITY_KEY = "sentinel-density";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [palette, setPaletteState] = useState<ThemePalette>(
    () => (localStorage.getItem(PALETTE_KEY) as ThemePalette) || "midnight"
  );
  const [density, setDensityState] = useState<ThemeDensity>(
    () => (localStorage.getItem(DENSITY_KEY) as ThemeDensity) || "default"
  );

  const setPalette = useCallback((p: ThemePalette) => {
    setPaletteState(p);
    localStorage.setItem(PALETTE_KEY, p);
  }, []);

  const setDensity = useCallback((d: ThemeDensity) => {
    setDensityState(d);
    localStorage.setItem(DENSITY_KEY, d);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // Remove all palette classes
    root.classList.remove("theme-midnight", "theme-arctic", "theme-ember", "theme-forest");
    root.classList.add(`theme-${palette}`);

    // Remove all density classes
    root.classList.remove("density-compact", "density-default", "density-comfortable");
    root.classList.add(`density-${density}`);

    // Toggle dark class based on palette
    if (palette === "arctic") {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }
  }, [palette, density]);

  return (
    <ThemeContext.Provider value={{ palette, density, setPalette, setDensity }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
