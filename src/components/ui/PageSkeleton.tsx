import { Skeleton } from "@/components/ui/skeleton";

/** In-shell loading placeholder — header/nav stay visible. */
export default function PageSkeleton() {
  return (
    <div className="container px-4 py-6 space-y-6 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-52 w-full rounded-2xl" />
    </div>
  );
}
