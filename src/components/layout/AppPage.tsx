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
        "w-full mx-auto px-4 pt-2 pb-6 md:px-8 md:pt-4 md:pb-8",
        className,
      )}
    >
      <div className={cn(innerWidthClass[width], innerClassName)}>
        {children}
      </div>
    </main>
  );
}
