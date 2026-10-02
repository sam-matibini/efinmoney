import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  /** Effective theme (forced theme wins over the stored preference). */
  theme: Theme;
  /** Logged-in app preference (defaults to the navy design). */
  appTheme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setForcedTheme: (t: Theme | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "efinmoney-theme";
const APP_STORAGE_KEY = "efinmoney-app-theme";

const readStored = (key: string, fallback: Theme): Theme => {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  return stored === "light" || stored === "dark" ? stored : fallback;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(() => readStored(STORAGE_KEY, "light"));
  const [appTheme, setAppTheme] = useState<Theme>(() => readStored(APP_STORAGE_KEY, "dark"));
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

  useEffect(() => {
    localStorage.setItem(APP_STORAGE_KEY, appTheme);
  }, [appTheme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setAppTheme((p) => (p === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme: effective, appTheme, toggleTheme, setTheme, setForcedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};

/** Pins the theme while the calling component is mounted. */
export const useForcedTheme = (t: Theme) => {
  const { setForcedTheme } = useTheme();
  useEffect(() => {
    setForcedTheme(t);
    return () => setForcedTheme(null);
  }, [t, setForcedTheme]);
};
