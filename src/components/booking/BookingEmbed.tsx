import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Hosted Reception AI voice booking assistant. Single source for the booking URL. */
export const BOOKING_URL = "https://app.reception.ai/smb-public/book/efinmoney";

/**
 * Full-bleed Reception AI booking iframe with a loading overlay. Fills its
 * container — the parent controls size (a page, the Alice sheet, a landing panel).
 */
export default function BookingEmbed({
  className,
  title = "Book a call with eFinMoney",
}: {
  className?: string;
  title?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={cn("relative h-full w-full", className)}>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading the booking assistant…</p>
        </div>
      )}
      <iframe
        src={BOOKING_URL}
        title={title}
        allow="microphone"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
