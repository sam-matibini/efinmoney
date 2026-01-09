import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialStatementsPanel } from "./FinancialStatementsPanel";
import { CashFlowPanel } from "./CashFlowPanel";

export const StatementsPanel = () => {
  return (
    <Tabs defaultValue="financial" className="space-y-4">
      <TabsList>
        <TabsTrigger value="financial">Balance Sheet & Income</TabsTrigger>
        <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
      </TabsList>

      <TabsContent value="financial">
        <FinancialStatementsPanel />
      </TabsContent>

      <TabsContent value="cashflow">
        <CashFlowPanel />
      </TabsContent>
    </Tabs>
  );
};
