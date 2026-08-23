import { Button } from "@/components/ui/button";
import { Loader2, Trash2, CreditCard, Building2 } from "lucide-react";
import { useBamboraMethods, useDeleteBamboraMethod } from "@/hooks/useBamboraMethods";

/** Lists Bambora / Worldline saved cards + bank profiles. */
export default function BamboraSavedMethods() {
  const { data: methods = [], isLoading } = useBamboraMethods();
  const del = useDeleteBamboraMethod();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Worldline methods…
      </div>
    );
  }

  if (!methods.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Worldline / Bambora</h3>
      <ul className="space-y-2">
        {methods.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              {m.method_type === "bank" ? (
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                {m.method_type === "bank" ? (
                  <p>
                    Bank · Inst {m.institution_number} · ••••{m.account_last_four}
                  </p>
                ) : (
                  <p className="capitalize">
                    {m.card_brand || "Card"} ·••• {m.last_four}
                    {m.exp_month && m.exp_year
                      ? ` · ${String(m.exp_month).padStart(2, "0")}/${String(m.exp_year).slice(-2)}`
                      : ""}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{m.currency_code}</p>
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={del.isPending}
              onClick={() => del.mutate(m.id)}
              aria-label="Remove"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
