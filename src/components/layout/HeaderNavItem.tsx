import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import NavIconImage from "@/components/layout/NavIconImage";
import { navDesktopClass } from "@/components/layout/headerStyles";
import { navIconImgClass } from "@/components/layout/navIconAssets";

const spring = { type: "spring" as const, stiffness: 460, damping: 28, mass: 0.75 };
const iconSpring = { type: "spring" as const, stiffness: 520, damping: 20, mass: 0.65 };

type HeaderNavItemProps = {
  label: string;
  href: string;
  isActive: boolean;
  onWarmRoute: () => void;
};

const HeaderNavItem = ({
  label,
  href,
  isActive,
  onWarmRoute,
}: HeaderNavItemProps) => {
  const link = (withLabel: boolean) => (
    <Link
      to={href}
      onMouseEnter={onWarmRoute}
      onFocus={onWarmRoute}
      onTouchStart={onWarmRoute}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      title={withLabel ? label : undefined}
      className={navDesktopClass(isActive, withLabel)}
    >
      {isActive && (
        <motion.span
          layoutId="header-nav-active-pill"
          className="absolute inset-0 rounded-lg bg-background shadow-md ring-1 ring-primary/30 header-nav-active-pulse"
          transition={spring}
          initial={false}
        />
      )}

      {!isActive && (
        <span className="absolute inset-0 rounded-lg bg-background/0 group-hover/nav:bg-background/60 transition-colors duration-300 ease-out" />
      )}

      <motion.span
        className="relative z-10 flex items-center justify-center"
        whileHover={{ scale: 1.14, y: -2, rotate: isActive ? 0 : -3 }}
        whileTap={{ scale: 0.9, y: 0 }}
        transition={iconSpring}
      >
        <NavIconImage label={label} className={`${navIconImgClass} header-nav-icon`} />
      </motion.span>

      {withLabel && (
        <motion.span
          className="relative z-10 hidden 2xl:block min-w-0 max-w-[5.25rem] 2xl:max-w-[7.5rem] text-[11px] font-medium truncate text-center"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.05, ...spring }}
        >
          {label}
        </motion.span>
      )}

      {isActive && (
        <motion.span
          layoutId="header-nav-active-dot"
          className="absolute -bottom-0.5 left-1/2 z-10 w-1.5 h-1.5 -translate-x-1/2 rounded-full bg-primary header-nav-dot"
          transition={spring}
          initial={false}
        />
      )}
    </Link>
  );

  const iconOnly = (
    <motion.div
      className="flex flex-1 min-w-0 justify-center 2xl:hidden"
      variants={{
        hidden: { opacity: 0, y: -12, scale: 0.82 },
        show: { opacity: 1, y: 0, scale: 1, transition: spring },
      }}
    >
      {link(false)}
    </motion.div>
  );

  const withLabelLink = (
    <motion.div
      className="hidden 2xl:flex flex-1 min-w-0 justify-center"
      variants={{
        hidden: { opacity: 0, y: -12, scale: 0.82 },
        show: { opacity: 1, y: 0, scale: 1, transition: spring },
      }}
    >
      {link(true)}
    </motion.div>
  );

  return (
    <>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span className="contents 2xl:hidden">{iconOnly}</span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="text-xs font-medium 2xl:hidden border-primary/20 shadow-lg animate-in fade-in-0 zoom-in-95 duration-200"
        >
          {label}
        </TooltipContent>
      </Tooltip>
      {withLabelLink}
    </>
  );
};

export default HeaderNavItem;
