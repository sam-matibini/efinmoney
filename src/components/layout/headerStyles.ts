/**
 * Header design system — unified brand nav with colored icons (not rainbow labels).
 */

export const headerNavInteractive =
  "group/nav relative transition-all duration-200 ease-out header-hover-lift";

export const headerNavActiveMotion = "header-nav-active-pulse";

export const headerNavIconMotion = "header-nav-icon-rock";

export const headerIconInteractive =
  "transition-all duration-200 ease-out header-hover-lift header-hover-ring";

export const headerIconBreathe = "header-icon-breathe";

export const headerIconBase = "p-2 rounded-lg";

export const headerNavTrack =
  "flex items-center gap-0.5 rounded-xl border border-border/50 bg-muted/40 p-2 shadow-inner w-full";

export const headerSearchClass =
  "h-10 w-full rounded-lg border border-border/60 bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-colors duration-200";

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
  "Payment links": "text-violet-600 dark:text-violet-400",
  "Top up": "text-emerald-600 dark:text-emerald-400",
  Contacts: "text-cyan-600 dark:text-cyan-400",
  Exchange: "text-indigo-600 dark:text-indigo-400",
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

export function navDesktopClass(active: boolean, withLabel = false) {
  return [
    withLabel
      ? "inline-flex items-center justify-center gap-1.5 px-2.5 h-10 rounded-lg flex-1 min-w-0 max-w-[9.5rem]"
      : "inline-flex items-center justify-center w-10 h-10 rounded-lg flex-1 min-w-[2.5rem] max-w-[3rem]",
    headerNavInteractive,
    active
      ? `bg-background text-foreground shadow-sm ring-1 ring-primary/25 ${headerNavActiveMotion} ${headerNavIconMotion}`
      : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
  ].join(" ");
}

export function navMobileClass(active: boolean) {
  return [
    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium w-full",
    headerNavInteractive,
    active
      ? `bg-primary/10 text-primary ${headerNavActiveMotion}`
      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
  ].join(" ");
}

export const profileTriggerClass =
  "flex items-center gap-1.5 p-1 pr-2 rounded-lg border border-border/60 bg-background/80 hover:bg-muted/60 transition-all duration-200 header-hover-lift";

export const profileBadgeClass =
  "hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/12 text-sky-700 border border-sky-500/20 dark:text-sky-300";

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
