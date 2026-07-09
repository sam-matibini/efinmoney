import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="relative p-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-300 transition-all duration-200 overflow-hidden hover:scale-110 active:scale-95"
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === "light" ? (
          <motion.span
            key="moon"
            initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.3 }}
            className="inline-flex"
          >
            <Moon className="w-5 h-5 text-indigo-500 dark:text-indigo-300" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.3 }}
            className="inline-flex"
          >
            <Sun className="w-5 h-5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
};

export default ThemeToggle;
