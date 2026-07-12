import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

export type ComingSoonProps = {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

const ComingSoon = ({
  title = "Coming soon",
  description = "We're building this next. Nigeria and Ghana transfers are live today.",
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
  className = "",
}: ComingSoonProps) => (
  <Card className={`border-dashed ${className}`}>
    <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Clock className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      {backHref && (
        <Button variant="outline" asChild>
          <Link to={backHref}>{backLabel}</Link>
        </Button>
      )}
    </CardContent>
  </Card>
);

export default ComingSoon;
