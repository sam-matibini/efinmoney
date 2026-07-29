import { ErrorBoundary } from "@sentry/react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  name: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

const DefaultFallback = ({ onReset }: { onReset: () => void }) => (
  <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10">
    <AlertTriangle className="w-8 h-8 text-muted-foreground mb-2" />
    <p className="text-sm text-muted-foreground">This section is temporarily unavailable</p>
    <Button variant="ghost" size="sm" onClick={onReset} className="mt-2">
      Try again
    </Button>
  </div>
);

const SectionBoundary = ({ name, children, fallback }: Props) => (
  <ErrorBoundary
    fallback={({ resetErrorBoundary }) =>
      fallback ?? (
        <DefaultFallback onReset={resetErrorBoundary} />
      )
    }
    onError={(error) => {
      console.error(`[SectionBoundary:${name}]`, error);
    }}
  >
    {children}
  </ErrorBoundary>
);

export default SectionBoundary;
export { SectionBoundary };
