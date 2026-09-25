import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Primary checkout action with Cancel on the right. Cancel returns to the dashboard. */
export function CheckoutActionRow({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1 [&_button]:h-12 [&_button]:w-full">{children}</div>
      <Button
        type="button"
        variant="outline"
        className="h-12 shrink-0 rounded-full px-5 text-base font-semibold"
        onClick={() => navigate("/dashboard")}
      >
        Cancel
      </Button>
    </div>
  );
}
