import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { productFeatures } from "@/lib/productFeatures";
import { NUVEI_MW_DOCS, nuveiCadEftComingSoon } from "@/lib/nuveiMiddleware";

/**
 * CAD Bank checkout: Nuvei EFT debit is wired to Payment Middleware sandbox
 * but stays Coming soon until live keys exist.
 */
export default function NuveiEftComingSoon({ className }: { className?: string }) {
  if (!productFeatures.nuvei || !nuveiCadEftComingSoon()) return null;
  return (
    <div className={className ?? "rounded-lg border border-dashed border-pay-bank/40 bg-background/70 p-3 space-y-1.5"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Nuvei EFT</p>
        <Badge variant="secondary" className="shrink-0 gap-1 text-[10px] font-semibold uppercase tracking-wide">
          <Clock className="h-3 w-3" />
          Coming soon
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Canadian bank debit through Nuvei Payment Middleware (sandbox). Live keys are not
        available yet — Confirm still uses your linked bank / Loop EFT.
      </p>
      <p className="text-[11px] text-muted-foreground">
        API: {NUVEI_MW_DOCS.replace("https://", "")}
      </p>
    </div>
  );
}
