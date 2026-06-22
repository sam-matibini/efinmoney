import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CanadaBillPayFlow from "@/components/bills/CanadaBillPayFlow";

const CanadaBillPayPage = () => (
  <main className="container px-4 py-6 min-h-[80vh]">
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" asChild>
          <Link to="/pay-bills" aria-label="Back to Pay Bills">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold">Pay a Canadian bill</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Send an EFT from your CAD wallet to a biller&apos;s bank account — utilities, telecom, tax, and more.
          </p>
        </div>
      </div>
      <CanadaBillPayFlow />
    </div>
  </main>
);

export default CanadaBillPayPage;
