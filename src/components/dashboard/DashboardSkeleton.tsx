import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardSkeleton() {
  return (
    <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">
      <div className="w-full space-y-6 animate-pulse">
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>

        <div className="flex flex-col items-center justify-center space-y-2 py-8">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-72" />
          <Skeleton className="h-5 w-32" />
        </div>

        <div className="flex gap-4 overflow-hidden">
          <Skeleton className="h-52 min-w-[300px] flex-1 rounded-2xl" />
          <Skeleton className="h-52 min-w-[300px] flex-1 rounded-2xl" />
          <Skeleton className="h-52 min-w-[300px] flex-1 rounded-2xl" />
        </div>

        <div className="flex gap-3">
          <Skeleton className="h-24 flex-1 rounded-xl" />
          <Skeleton className="h-24 flex-1 rounded-xl" />
          <Skeleton className="h-24 flex-1 rounded-xl" />
          <Skeleton className="h-24 flex-1 rounded-xl" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>

        <div className="rounded-xl border p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>

        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </main>
  );
}
