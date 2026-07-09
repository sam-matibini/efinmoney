import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { headerIconBase, headerIconInteractive, headerIconVariants } from "@/components/layout/headerStyles";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <motion.button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      whileHover={{ scale: 1.08, y: -1, rotate: theme === "light" ? 8 : -8 }}
      whileTap={{ scale: 0.9, rotate: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      className={`relative overflow-hidden ${headerIconBase} ${headerIconInteractive} ${headerIconVariants.theme}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === "light" ? (
          <motion.span
            key="moon"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="inline-flex"
          >
            <Moon className="w-5 h-5" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="inline-flex"
          >
            <Sun className="w-5 h-5" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

export default ThemeToggle;
