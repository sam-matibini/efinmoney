import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, LogOut, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotificationsPanel from "@/components/header/NotificationsPanel";
import PendingTransfersButton from "@/components/header/PendingTransfersButton";
import SupportLink from "@/components/header/SupportLink";
import SearchModal from "@/components/header/SearchModal";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { avatarInitials, resolveAvatarUrl } from "@/lib/avatar";
import { useNavModel } from "@/components/layout/useNavModel";

/**
 * Account utilities that used to live in the top header (search, support, pending
 * transfers, notifications, profile menu). Sits in the content area, not as a nav bar.
 */
export default function AppUtilityBar() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { data: profile } = useProfile();
  const { businessLabel, businessHref, businessPrimary } = useNavModel();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const avatarUrl = resolveAvatarUrl(profile, user);
  const initial = avatarInitials(profile, user);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1 h-14 px-4 md:px-8">
        <Link
          to="/dashboard"
          className="md:hidden flex items-center gap-2 mr-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
          aria-label="eFinMoney dashboard"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-gold)] text-[var(--color-bg-primary)] text-sm font-extrabold">
            eF
          </span>
          <span className="font-bold text-white">eFinMoney</span>
        </Link>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 h-9 w-56 mr-auto rounded-[var(--radius-full)] border border-[var(--color-border)] bg-white/[0.04] px-3 text-sm text-[var(--color-text-muted)] hover:bg-white/[0.07] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
          aria-label="Search transfers, contacts, wallets"
        >
          <Search size={16} aria-hidden />
          Search…
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="md:hidden h-9 w-9 flex items-center justify-center rounded-full text-[var(--color-text-label)] hover:bg-white/[0.06]"
          aria-label="Search"
        >
          <Search size={20} aria-hidden />
        </button>

        <SupportLink />
        <PendingTransfersButton />
        <NotificationsPanel />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="bg-[var(--color-accent-gold)] text-[var(--color-bg-primary)] text-xs font-bold">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-foreground">Account</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>Profile Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/kyc")}>
              {businessPrimary ? "Business verification (KYB)" : "Personal KYC verification"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/security")}>Security</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(businessHref)}>
              <Building2 className="w-4 h-4 mr-2" />
              {businessLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={searchQuery}
        onQueryChange={setSearchQuery}
      />
    </TooltipProvider>
  );
}
