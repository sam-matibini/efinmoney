import { motion } from "framer-motion";

interface Props {
  count?: number;
  className?: string;
}

/**
 * Confetti-style particle burst that shoots outward from origin.
 * Designed to sit absolutely positioned behind a focal element.
 */
const ParticleBurst = ({ count = 18, className }: Props) => {
  const colors = [
    "hsl(var(--primary))",
    "hsl(var(--primary) / 0.7)",
    "#fbbf24",
    "#34d399",
    "#60a5fa",
  ];
  return (
    <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${className || ""}`}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const distance = 80 + Math.random() * 60;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const color = colors[i % colors.length];
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
            animate={{ x, y, opacity: 0, scale: 1 }}
            transition={{
              duration: 0.9 + Math.random() * 0.4,
              delay: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="absolute h-2 w-2 rounded-full"
            style={{ background: color }}
          />
        );
      })}
    </div>
  );
};

export default ParticleBurst;
