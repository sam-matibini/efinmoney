import { Bell, Check, Megaphone } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNotifications, useMarkAllRead, useMarkRead } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { headerIconBase, headerIconInteractive, headerIconVariants } from "@/components/layout/headerStyles";

type NotificationsPanelProps = {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Sidebar bell opens a full readable panel. Header keeps the compact popover. */
  variant?: "popover" | "dialog";
};

const NotificationsPanel = ({
  side = "bottom",
  align = "end",
  variant = "popover",
}: NotificationsPanelProps) => {
  const { data: notifications = [], unreadCount, isLoading } = useNotifications();
  const markAll = useMarkAllRead();
  const markOne = useMarkRead();

  const trigger = (
    <motion.button
      type="button"
      aria-label="Notifications"
      whileHover={{ scale: 1.08, y: -1 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      className={cn(
        `relative ${headerIconBase} ${headerIconInteractive} ${headerIconVariants.notifications}`,
        unreadCount > 0 && "animate-bell-shake",
      )}
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full flex items-center justify-center ring-2 ring-background header-nav-dot"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </motion.span>
      )}
    </motion.button>
  );

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-border p-4">
      <p className="text-base font-semibold text-foreground">Notifications</p>
      {unreadCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
        >
          <Check className="mr-1 h-3 w-3" /> Mark all read
        </Button>
      )}
    </div>
  );

  const list = (
    <div className={cn("overflow-y-auto", variant === "dialog" ? "max-h-[min(70vh,640px)]" : "max-h-[min(60vh,480px)]")}>
      {isLoading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
      ) : notifications.length === 0 ? (
        <div className="p-8 text-center">
          <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {notifications.map((n) => {
            const isAnnouncement = n.type === "announcement";
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => !n.is_read && markOne.mutate(n.id)}
                className={cn(
                  "w-full p-4 text-left transition-colors hover:bg-muted/50",
                  !n.is_read && "bg-primary/5",
                  isAnnouncement && "border-l-2 border-amber-500",
                )}
              >
                <div className="flex items-start gap-2">
                  {isAnnouncement ? (
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Megaphone className="h-3.5 w-3.5" />
                    </span>
                  ) : !n.is_read ? (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {isAnnouncement && (
                        <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          Announcement
                        </span>
                      )}
                      {n.title}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (variant === "dialog") {
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="z-[400] max-h-[85vh] max-w-lg gap-0 overflow-hidden bg-background p-0">
          <DialogHeader className="space-y-0 border-b border-border p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Notifications</DialogTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                >
                  <Check className="mr-1 h-3 w-3" /> Mark all read
                </Button>
              )}
            </div>
          </DialogHeader>
          {list}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={12}
        collisionPadding={16}
        className="z-[400] w-[min(420px,calc(100vw-2rem))] p-0"
      >
        {header}
        {list}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsPanel;
