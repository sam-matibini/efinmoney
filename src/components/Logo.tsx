import { motion } from "framer-motion";
import logo from "@/assets/efin-logo-new.png";

export const Logo = ({ className = "w-16 h-16" }: { className?: string }) => (
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

export const Wordmark = ({ className = "" }: { className?: string }) => (
  <span
    className={`bg-clip-text text-transparent bg-[linear-gradient(110deg,#4f46e5_0%,#6366f1_30%,#c7d2fe_50%,#6366f1_70%,#4f46e5_100%)] bg-[length:200%_100%] animate-[brandShine_4s_linear_infinite] ${className}`}
    style={{ WebkitBackgroundClip: "text" }}
  >
    eFinMoney
    <style>{`@keyframes brandShine{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
  </span>
);

export default Logo;
