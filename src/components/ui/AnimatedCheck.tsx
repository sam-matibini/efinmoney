import { motion } from "framer-motion";

interface Props {
  size?: number;
  className?: string;
}

/**
 * SVG checkmark that draws itself with a stroke animation.
 * Used in success states for satisfying confirmation feedback.
 */
const AnimatedCheck = ({ size = 80, className }: Props) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      className={className}
      fill="none"
    >
      <motion.circle
        cx="40"
        cy="40"
        r="36"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <motion.path
        d="M24 41 L36 53 L57 30"
        stroke="hsl(var(--primary))"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, delay: 0.45, ease: "easeOut" }}
      />
    </svg>
  );
};

export default AnimatedCheck;
