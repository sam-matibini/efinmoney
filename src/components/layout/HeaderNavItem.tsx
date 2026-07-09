import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { navDesktopClass, navIconTint } from "@/components/layout/headerStyles";

const shortLabels: Record<string, string> = {
  "Payment links": "Links",
};

type HeaderNavItemProps = {
  label: string;
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  onWarmRoute: () => void;
};

const HeaderNavItem = ({
  label,
  href,
  icon: Icon,
  isActive,
  onWarmRoute,
}: HeaderNavItemProps) => {
  const displayLabel = shortLabels[label] ?? label;

  const linkBody = (withLabel: boolean) => (
    <Link
      to={href}
      onMouseEnter={onWarmRoute}
      onFocus={onWarmRoute}
      onTouchStart={onWarmRoute}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={navDesktopClass(isActive, withLabel)}
    >
      <Icon className={`w-[18px] h-[18px] shrink-0 header-hover-icon ${navIconTint(label)}`} />
      {withLabel && (
        <span className="hidden 2xl:inline text-xs font-medium truncate">{displayLabel}</span>
      )}
      {isActive && (
        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary header-nav-dot" />
      )}
    </Link>
  );

  const iconOnly = (
    <motion.div
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className="flex flex-1 min-w-0 justify-center 2xl:hidden"
    >
      {linkBody(false)}
    </motion.div>
  );

  const withLabelLink = (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className="hidden 2xl:flex flex-1 min-w-0 justify-center"
    >
      {linkBody(true)}
    </motion.div>
  );

  return (
    <>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="contents 2xl:hidden">{iconOnly}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-medium 2xl:hidden">
          {label}
        </TooltipContent>
      </Tooltip>
      {withLabelLink}
    </>
  );
};

export default HeaderNavItem;
