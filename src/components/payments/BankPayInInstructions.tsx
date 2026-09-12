import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type PayInField = { label: string; value: string };

export type PayInInstructions = {
  heading: string;
  description: string;
  fromBank: string;
  reference?: string;
  fields: PayInField[];
  note?: string;
};

async function copyValue(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy");
  }
}

export default function BankPayInInstructions({ data }: { data: PayInInstructions }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{data.heading}</p>
        <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
      </div>
      <p className="text-sm">
        From: <span className="font-medium">{data.fromBank}</span>
      </p>
      {data.reference && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Payment reference</p>
            <p className="font-mono text-sm break-all">{data.reference}</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Copy reference"
            onClick={() => void copyValue(data.reference!, "Reference")}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="space-y-2 rounded-lg border p-3">
        {data.fields.map((f) => (
          <div key={f.label} className="flex items-start justify-between gap-2 text-sm">
            <span className="text-muted-foreground shrink-0">{f.label}</span>
            <span className="font-medium text-right break-all">{f.value}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              aria-label={`Copy ${f.label}`}
              onClick={() => void copyValue(f.value, f.label)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      {data.note && <p className="text-xs text-muted-foreground">{data.note}</p>}
    </div>
  );
}
