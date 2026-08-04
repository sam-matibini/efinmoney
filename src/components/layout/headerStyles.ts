/**
 * Header design system — unified brand nav with colored icons (not rainbow labels).
 */

export const headerNavInteractive =
  "group/nav relative transition-[color,transform,box-shadow] duration-300 ease-out header-hover-lift overflow-hidden";

export const headerNavActiveMotion = "header-nav-active-pulse";

export const headerNavTrack =
  "header-nav-track relative flex items-center gap-1 rounded-xl border border-border/50 bg-muted/40 p-2 shadow-inner w-full";

export const headerIconInteractive =
  "transition-[transform,box-shadow,background-color] duration-300 ease-out header-hover-lift header-hover-ring header-action-btn";

export const headerIconBreathe = "header-icon-breathe";

export const headerIconBase = "p-1.5 sm:p-2 rounded-lg";

export const headerSearchClass =
  "header-search-input h-9 sm:h-10 w-full min-w-0 rounded-lg border border-border/60 bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-300 ease-out";

export const headerIconVariants = {
  menu: "bg-primary/12 text-primary hover:bg-primary/20",
  search: "bg-sky-500/12 text-sky-600 hover:bg-sky-500/22 dark:text-sky-400",
  theme: "bg-indigo-500/12 text-indigo-600 hover:bg-indigo-500/22 dark:text-indigo-400",
  notifications: "bg-amber-500/12 text-amber-600 hover:bg-amber-500/22 dark:text-amber-400",
  quickActions: "bg-violet-500/12 text-violet-600 hover:bg-violet-500/22 dark:text-violet-400",
} as const;

/** Icon tint only — labels stay neutral for a professional look */
export const navIconTints: Record<string, string> = {
  Dashboard: "text-primary",
  Send: "text-sky-600 dark:text-sky-400",
  "Payment Links": "text-violet-600 dark:text-violet-400",
  "Top up": "text-emerald-600 dark:text-emerald-400",
  Contacts: "text-cyan-600 dark:text-cyan-400",
  "Foreign Currency Exchange": "text-indigo-600 dark:text-indigo-400",
  Wallets: "text-teal-600 dark:text-teal-400",
  Cards: "text-blue-600 dark:text-blue-400",
  Finance: "text-emerald-600 dark:text-emerald-400",
  Operations: "text-cyan-600 dark:text-cyan-400",
  Admin: "text-rose-600 dark:text-rose-400",
  Settings: "text-primary",
};

export function navIconTint(label: string) {
  return navIconTints[label] ?? "text-primary";
}

/**
 * Per-item cell colour: the whole nav cell is tinted (not just the icon).
 * idle = resting tint, hover = deeper tint, active = strongest tint + ring/glow,
 * label = medium-bold label colour in the same hue.
 */
type NavCellTone = { idle: string; hover: string; active: string; label: string };

export const navCellTones: Record<string, NavCellTone> = {
  Dashboard: {
    idle: "bg-primary/18",
    hover: "group-hover/nav:bg-primary/20",
    active: "bg-primary/20 ring-1 ring-primary/40 shadow-[0_4px_14px_-6px_hsl(var(--primary)/0.55)]",
    label: "text-primary",
  },
  Send: {
    idle: "bg-sky-500/20",
    hover: "group-hover/nav:bg-sky-500/22",
    active: "bg-sky-500/22 ring-1 ring-sky-500/45 shadow-[0_4px_14px_-6px_rgb(14_165_233/0.6)]",
    label: "text-sky-700 dark:text-sky-300",
  },
  "Payment Links": {
    idle: "bg-violet-500/20",
    hover: "group-hover/nav:bg-violet-500/22",
    active: "bg-violet-500/22 ring-1 ring-violet-500/45 shadow-[0_4px_14px_-6px_rgb(139_92_246/0.6)]",
    label: "text-violet-700 dark:text-violet-300",
  },
  "Top up": {
    idle: "bg-emerald-500/20",
    hover: "group-hover/nav:bg-emerald-500/22",
    active: "bg-emerald-500/22 ring-1 ring-emerald-500/45 shadow-[0_4px_14px_-6px_rgb(16_185_129/0.6)]",
    label: "text-emerald-700 dark:text-emerald-300",
  },
  Contacts: {
    idle: "bg-cyan-500/20",
    hover: "group-hover/nav:bg-cyan-500/22",
    active: "bg-cyan-500/22 ring-1 ring-cyan-500/45 shadow-[0_4px_14px_-6px_rgb(6_182_212/0.6)]",
    label: "text-cyan-700 dark:text-cyan-300",
  },
  "Foreign Currency Exchange": {
    idle: "bg-indigo-500/20",
    hover: "group-hover/nav:bg-indigo-500/22",
    active: "bg-indigo-500/22 ring-1 ring-indigo-500/45 shadow-[0_4px_14px_-6px_rgb(99_102_241/0.6)]",
    label: "text-indigo-700 dark:text-indigo-300",
  },
  Wallets: {
    idle: "bg-teal-500/20",
    hover: "group-hover/nav:bg-teal-500/22",
    active: "bg-teal-500/22 ring-1 ring-teal-500/45 shadow-[0_4px_14px_-6px_rgb(20_184_166/0.6)]",
    label: "text-teal-700 dark:text-teal-300",
  },
  Cards: {
    idle: "bg-blue-500/20",
    hover: "group-hover/nav:bg-blue-500/22",
    active: "bg-blue-500/22 ring-1 ring-blue-500/45 shadow-[0_4px_14px_-6px_rgb(59_130_246/0.6)]",
    label: "text-blue-700 dark:text-blue-300",
  },
  Business: {
    idle: "bg-fuchsia-500/20",
    hover: "group-hover/nav:bg-fuchsia-500/22",
    active: "bg-fuchsia-500/22 ring-1 ring-fuchsia-500/45 shadow-[0_4px_14px_-6px_rgb(217_70_239/0.6)]",
    label: "text-fuchsia-700 dark:text-fuchsia-300",
  },
  Finance: {
    idle: "bg-green-500/20",
    hover: "group-hover/nav:bg-green-500/22",
    active: "bg-green-500/22 ring-1 ring-green-500/45 shadow-[0_4px_14px_-6px_rgb(34_197_94/0.6)]",
    label: "text-green-700 dark:text-green-300",
  },
  Operations: {
    idle: "bg-amber-500/20",
    hover: "group-hover/nav:bg-amber-500/22",
    active: "bg-amber-500/22 ring-1 ring-amber-500/45 shadow-[0_4px_14px_-6px_rgb(245_158_11/0.6)]",
    label: "text-amber-700 dark:text-amber-300",
  },
  Admin: {
    idle: "bg-rose-500/20",
    hover: "group-hover/nav:bg-rose-500/22",
    active: "bg-rose-500/22 ring-1 ring-rose-500/45 shadow-[0_4px_14px_-6px_rgb(244_63_94/0.6)]",
    label: "text-rose-700 dark:text-rose-300",
  },
  Settings: {
    idle: "bg-slate-500/20",
    hover: "group-hover/nav:bg-slate-500/22",
    active: "bg-slate-500/22 ring-1 ring-slate-500/45 shadow-[0_4px_14px_-6px_rgb(100_116_139/0.6)]",
    label: "text-slate-700 dark:text-slate-300",
  },
};

const defaultNavCellTone: NavCellTone = {
  idle: "bg-primary/18",
  hover: "group-hover/nav:bg-primary/20",
  active: "bg-primary/20 ring-1 ring-primary/40",
  label: "text-primary",
};

export function navCellTone(label: string): NavCellTone {
  return navCellTones[label] ?? defaultNavCellTone;
}


/** Compact labels shown under each desktop nav icon so items are self-identifying. */
export const navShortLabels: Record<string, string> = {
  Dashboard: "Dashboard",
  Send: "Send",
  "Payment Links": "Payments",
  "Top up": "Top up",
  Contacts: "Contacts",
  "Foreign Currency Exchange": "Exchange",
  Wallets: "Wallets",
  Cards: "Cards",
  Business: "Business",
  Finance: "Finance",
  Operations: "Operations",
  Admin: "Admin",
  Settings: "Settings",
};

export function navShortLabel(label: string) {
  return navShortLabels[label] ?? label;
}

export function navDesktopClass(active: boolean, withLabel = false) {
  return [
    withLabel
      ? "inline-flex items-center justify-center gap-1 px-1.5 h-10 rounded-lg flex-1 min-w-0 max-w-[8.5rem] overflow-hidden"
      : "inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex-1 min-w-[2.25rem] max-w-[2.75rem]",
    headerNavInteractive,
    active
      ? `text-foreground z-10 ${headerNavActiveMotion}`
      : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

export function navMobileClass(active: boolean, label = "") {
  const tone = navCellTone(label);
  return [
    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold w-full",
    headerNavInteractive,
    tone.label,
    active ? `${tone.active} ${headerNavActiveMotion}` : `${tone.idle} hover:brightness-105`,
  ].join(" ");
}


export const profileTriggerClass =
  "flex items-center gap-1.5 p-1 pr-2 rounded-lg border border-border/60 bg-background/80 hover:bg-muted/60 transition-all duration-300 header-hover-lift header-profile-btn";

export const profileBadgeClass =
  "hidden xl:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/12 text-sky-700 border border-sky-500/20 dark:text-sky-300";

export const quickActionTileTones: Record<string, string> = {
  Send: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  "Add Money": "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  Receive: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
  "Pay Bills": "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  Domestic: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  Exchange: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  "Mobile Money": "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400",
  Savings: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
};
