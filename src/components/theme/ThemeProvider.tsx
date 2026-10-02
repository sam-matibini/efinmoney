import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  /** Effective theme (forced theme wins over the stored preference). */
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setForcedTheme: (t: Theme | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "efinmoney-theme";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return "light";
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [forced, setForcedTheme] = useState<Theme | null>(null);
  const effective = forced ?? theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(effective);
    root.style.colorScheme = effective;
  }, [effective]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState((p) => (p === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme: effective, toggleTheme, setTheme, setForcedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};

/** Pins the theme while the calling component is mounted (the logged-in app is always navy). */
export const useForcedTheme = (t: Theme) => {
  const { setForcedTheme } = useTheme();
  useEffect(() => {
    setForcedTheme(t);
    return () => setForcedTheme(null);
  }, [t, setForcedTheme]);
};
