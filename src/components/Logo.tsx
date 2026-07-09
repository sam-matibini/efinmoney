import { motion } from "framer-motion";
import logo from "@/assets/efin-logo-new.png";

type LogoProps = {
  className?: string;
  /** Use in headers/nav — no float, spin, or bounce */
  static?: boolean;
};

export const Logo = ({ className = "w-24 h-24", static: isStatic = false }: LogoProps) => {
  if (isStatic) {
    return (
      <img
        src={logo}
        alt="eFinMoney"
        draggable={false}
        className={`${className} object-contain shrink-0 block`}
      />
    );
  }

  return (
    <motion.img
      src={logo}
      alt="eFinMoney"
      className={`${className} object-contain drop-shadow-[0_4px_18px_rgba(16,185,129,0.45)] cursor-pointer`}
      initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
      animate={{
        opacity: 1,
        scale: 1,
        rotate: 0,
        y: [0, -4, 0],
      }}
      transition={{
        opacity: { duration: 0.5 },
        scale: { type: "spring", stiffness: 180, damping: 12 },
        rotate: { type: "spring", stiffness: 180, damping: 12 },
        y: { duration: 3.5, repeat: Infinity, ease: "easeInOut" },
      }}
      whileHover={{ rotate: 360, scale: 1.08, transition: { duration: 0.9, ease: "easeInOut" } }}
    />
  );
};

type WordmarkProps = {
  className?: string;
  /** Stable gradient for headers — no shimmer animation */
  subtle?: boolean;
};

export const Wordmark = ({ className = "", subtle = false }: WordmarkProps) => {
  if (subtle) {
    return (
      <span
        className={`inline-block leading-none tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-800 via-amber-500 to-amber-600 dark:from-amber-300 dark:via-amber-400 dark:to-amber-500 ${className}`}
        style={{ WebkitBackgroundClip: "text" }}
      >
        eFinMoney
      </span>
    );
  }

  return (
    <span
      className={`bg-clip-text text-transparent bg-[linear-gradient(110deg,hsl(35_90%_25%)_0%,hsl(41_100%_45%)_30%,hsl(48_100%_65%)_50%,hsl(41_100%_45%)_70%,hsl(35_90%_25%)_100%)] bg-[length:200%_100%] animate-[brandShine_4s_linear_infinite] ${className}`}
      style={{ WebkitBackgroundClip: "text" }}
    >
      eFinMoney
      <style>{`@keyframes brandShine{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </span>
  );
};

export default Logo;
