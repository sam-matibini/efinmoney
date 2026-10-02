import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { avatarInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { useNavModel, type NavLinkItem } from "@/components/layout/useNavModel";

const itemBase =
  "relative flex items-center gap-3 h-11 mx-2 px-3 rounded-[10px] text-sm font-medium transition-all duration-150 ease-in-out " +
  "md:max-lg:justify-center md:max-lg:px-0 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]";

function SidebarLink({
  item,
  active,
  onWarm,
}: {
  item: NavLinkItem;
  active: boolean;
  onWarm: () => void;
}) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={item.href}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          onMouseEnter={onWarm}
          onFocus={onWarm}
          className={cn(
            itemBase,
            active
              ? "bg-[rgba(245,166,35,0.12)] text-[var(--color-text-primary)] font-semibold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-[var(--color-accent-gold)]"
              : "text-[var(--color-text-label)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]",
          )}
        >
          <Icon
            size={20}
            className="shrink-0"
            style={{ color: active ? "var(--color-accent-gold)" : item.color }}
            aria-hidden
          />
          <span className="truncate md:max-lg:hidden">{item.label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="lg:hidden">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

const Separator = () => <div className="h-px bg-[var(--color-hover)] mx-4 my-2" aria-hidden />;

/** Fixed, colour-grouped navigation: 220px on desktop, 72px icon rail on tablet, hidden on mobile. */
export default function Sidebar() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { groups, isActive, warmRoute, businessPrimary } = useNavModel();

  const fullName = profile?.full_name?.trim() || user?.email?.split("@")[0] || "Account";
  const initial = avatarInitials(profile, user).slice(0, 1).toUpperCase();

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-[100] flex-col w-[var(--sidebar-width-collapsed)] lg:w-[var(--sidebar-width)] h-screen overflow-hidden border-r border-[var(--color-border)] text-[var(--color-text-primary)]"
        style={{
          backgroundColor: "var(--color-bg-sidebar)",
          backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 100%)",
        }}
        aria-label="Main navigation"
      >
        <Link
          to="/dashboard"
          className="flex items-center gap-3 h-[72px] shrink-0 px-4 py-5 border-b border-[rgba(245,166,35,0.3)] md:max-lg:justify-center md:max-lg:px-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-gold)]"
          aria-label="eFinMoney dashboard"
        >
          <Logo static className="h-9 w-9" />
          <span className="min-w-0 leading-tight md:max-lg:hidden">
            <span className="block font-bold text-[var(--color-text-primary)]">eFinMoney</span>
            <span className="block text-[11px] text-[var(--color-text-muted)]">
              {businessPrimary ? "Business Platform" : "Personal Account"}
            </span>
          </span>
        </Link>

        <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-2">
          {groups.map((group, i) => (
            <Fragment key={group.id}>
              {i > 0 && <Separator />}
              <p
                className="mt-2 px-4 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-[1.5px] md:max-lg:hidden"
                style={{ color: group.color, opacity: 0.7 }}
              >
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5 md:max-lg:pt-2">
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.label}
                    item={item}
                    active={isActive(item.href)}
                    onWarm={() => warmRoute(item.href)}
                  />
                ))}
              </div>
            </Fragment>
          ))}
        </nav>

        <div className="shrink-0 pb-4">
          <Separator />
          <SidebarLink
            item={{ label: "Settings", href: "/profile", icon: Settings, color: "var(--color-accent-slate)" }}
            active={isActive("/profile")}
            onWarm={() => warmRoute("/profile")}
          />
          <Link
            to="/profile"
            className="mt-2 mx-2 flex items-center gap-3 rounded-[10px] px-3 py-2 hover:bg-[var(--color-hover)] transition-colors duration-150 md:max-lg:justify-center md:max-lg:px-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
            aria-label={`Profile: ${fullName}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-gold)] text-sm font-bold text-[var(--color-text-primary)]">
              {initial}
            </span>
            <span className="min-w-0 leading-tight md:max-lg:hidden">
              <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">{fullName}</span>
              <span className="block text-[11px] text-[var(--color-text-muted)]">eFinMoney</span>
            </span>
          </Link>
        </div>
      </aside>
    </TooltipProvider>
  );
}
