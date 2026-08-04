import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import NavIconImage from "@/components/layout/NavIconImage";
import { navShortLabel, navCellTone } from "@/components/layout/headerStyles";
import { navIconImgClass } from "@/components/layout/navIconAssets";

const spring = { type: "spring" as const, stiffness: 460, damping: 28, mass: 0.75 };
const iconSpring = { type: "spring" as const, stiffness: 520, damping: 20, mass: 0.65 };

type HeaderNavItemProps = {
  label: string;
  href: string;
  isActive: boolean;
  onWarmRoute: () => void;
};

/**
 * Desktop nav item: colored icon with a compact label underneath so every
 * destination is self-identifying (no hover required). The active item gets a
 * raised pill + brighter label.
 */
const HeaderNavItem = ({ label, href, isActive, onWarmRoute }: HeaderNavItemProps) => {
  const tone = navCellTone(label);

  return (
  <motion.div
    className="flex-1 min-w-0"
    variants={{
      hidden: { opacity: 0, y: -12, scale: 0.82 },
      show: { opacity: 1, y: 0, scale: 1, transition: spring },
    }}
  >
    <Link
      to={href}
      onMouseEnter={onWarmRoute}
      onFocus={onWarmRoute}
      onTouchStart={onWarmRoute}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className="group/nav relative flex flex-col items-center justify-center gap-0.5 px-1 py-1 rounded-lg min-w-0 transition-colors duration-300"
    >
      {isActive ? (
        <motion.span
          layoutId="header-nav-active-pill"
          className={`absolute inset-0 rounded-lg ${tone.active}`}
          transition={spring}
          initial={false}
        />
      ) : (
        <span className={`absolute inset-0 rounded-lg ${tone.idle} ${tone.hover} transition-colors duration-300`} />
      )}

      <motion.span
        className="relative z-10 flex items-center justify-center"
        whileHover={{ scale: 1.12, y: -1 }}
        whileTap={{ scale: 0.92 }}
        transition={iconSpring}
      >
        <NavIconImage label={label} className={`${navIconImgClass} header-nav-icon`} />
      </motion.span>

      <span
        className={`relative z-10 max-w-full truncate text-[10px] leading-none font-semibold tracking-tight ${tone.label} ${
          isActive ? "" : "opacity-90 group-hover/nav:opacity-100"
        }`}
      >
        {navShortLabel(label)}
      </span>
    </Link>
  </motion.div>
  );
};

export default HeaderNavItem;
