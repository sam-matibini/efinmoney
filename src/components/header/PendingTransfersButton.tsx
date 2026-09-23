import { useState } from "react";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useDashboardTransfers } from "@/hooks/useDashboardTransfers";
import PendingTransfersDialog, {
  filterPendingTransfers,
} from "@/components/dashboard/PendingTransfersDialog";
import {
  headerIconBase,
  headerIconInteractive,
  headerIconVariants,
} from "@/components/layout/headerStyles";
import { cn } from "@/lib/utils";

/** Top-bar control — only rendered when the user has in-flight transfers. */
export default function PendingTransfersButton() {
  const { data: transfers } = useDashboardTransfers();
  const pending = filterPendingTransfers(transfers);
  const [open, setOpen] = useState(false);

  if (pending.length === 0) return null;

  const count = pending.length;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.08, y: -1 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        className={cn(
          `relative ${headerIconBase} ${headerIconInteractive} ${headerIconVariants.pending}`,
        )}
        aria-label={`${count} pending transfer${count === 1 ? "" : "s"}`}
        title="Pending transfers"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white ring-2 ring-background"
        >
          {count > 99 ? "99+" : count}
        </motion.span>
      </motion.button>

      <PendingTransfersDialog
        open={open}
        onOpenChange={setOpen}
        transfers={transfers}
      />
    </>
  );
}
