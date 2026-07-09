import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
