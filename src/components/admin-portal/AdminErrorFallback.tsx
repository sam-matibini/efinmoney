import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => void;
}

export default function AdminErrorFallback({
  resetErrorBoundary,
}: AdminErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center min-h-[50vh]">
      <div className="mx-auto w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        An unexpected error occurred in this section. The admin sidebar is still
        available so you can navigate elsewhere.
      </p>
      <div className="flex gap-3 mt-2">
        {resetErrorBoundary && (
          <Button variant="default" size="sm" onClick={resetErrorBoundary}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Try again
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <a href="/admin/dashboard">
            <LayoutDashboard className="w-4 h-4 mr-2" />
            Go to Dashboard
          </a>
        </Button>
      </div>
    </div>
  );
}
