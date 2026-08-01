import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import BookingEmbed, { BOOKING_URL } from "@/components/booking/BookingEmbed";

/** Hosted Reception AI voice booking assistant, embedded full-bleed. */
export default function BookPage() {
  useEffect(() => {
    document.title = "Book a call — eFinMoney";

    const desc = "Book a call with the eFinMoney team using our AI receptionist — pick a time in seconds.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    const prevDesc = meta.getAttribute("content");
    meta.setAttribute("content", desc);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const createdCanonical = !canonical;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    const prevHref = canonical.href;
    canonical.href = `${window.location.origin}/book`;

    return () => {
      if (prevDesc) meta!.setAttribute("content", prevDesc);
      if (createdCanonical) canonical!.remove();
      else canonical!.href = prevHref;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            aria-label="Back to eFinMoney"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">Book a call</h1>
            <p className="truncate text-xs text-muted-foreground">Talk to the eFinMoney team</p>
          </div>
        </div>
        <a
          href={BOOKING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Open in new tab <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </header>

      <main className="relative flex-1">
        <BookingEmbed className="absolute inset-0" />
      </main>
    </div>
  );
}
