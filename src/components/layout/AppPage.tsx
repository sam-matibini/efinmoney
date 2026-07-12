import { cn } from "@/lib/utils";

/** Shared page width tiers — keeps banners and content aligned across routes. */
export type AppPageWidth = "wide" | "default" | "narrow";

const innerWidthClass: Record<AppPageWidth, string> = {
  /** Full container — wallets, dashboard, contacts grids, statements */
  wide: "w-full",
  /** Standard forms & flows — send, top-up, exchange, receive */
  default: "w-full max-w-5xl mx-auto",
  /** Compact settings & support */
  narrow: "w-full max-w-2xl mx-auto",
};

interface AppPageProps {
  children: React.ReactNode;
  width?: AppPageWidth;
  className?: string;
  innerClassName?: string;
}

export default function AppPage({
  children,
  width = "default",
  className,
  innerClassName,
}: AppPageProps) {
  return (
    <main
      className={cn(
        "container mx-auto px-4 py-6 pb-24 md:pb-6",
        className,
      )}
    >
      <div className={cn(innerWidthClass[width], innerClassName)}>
        {children}
      </div>
    </main>
  );
}
