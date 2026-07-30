import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SectionBoundary from "@/components/common/SectionBoundary";
import PartnersPanel from "./partners/PartnersPanel";
import PartnerCorridorsPanel from "./partners/PartnerCorridorsPanel";
import PartnerPricingPanel from "./partners/PartnerPricingPanel";
import PartnerFxRatesPanel from "./partners/PartnerFxRatesPanel";
import EfinPricingPanel from "./partners/EfinPricingPanel";
import PartnerLiquidityPanel from "./partners/PartnerLiquidityPanel";
import RoutingStrategyPanel from "./partners/RoutingStrategyPanel";
import LiveRoutingControlPanel from "./partners/LiveRoutingControlPanel";
import RouteSimulatorPanel from "./partners/RouteSimulatorPanel";
import RoutingAttemptsPanel from "./partners/RoutingAttemptsPanel";
import ProfitabilityPanel from "./partners/ProfitabilityPanel";
import CorridorReadinessPanel from "./partners/CorridorReadinessPanel";
import CostAssurancePanel from "./partners/CostAssurancePanel";

export const PartnerNetworkPanel = () => (
  <Tabs defaultValue="partners" className="space-y-4">
    <div className="overflow-x-auto pb-2">
      <TabsList className="inline-flex w-auto">
        <TabsTrigger value="partners">Partners</TabsTrigger>
        <TabsTrigger value="corridors">Corridors</TabsTrigger>
        <TabsTrigger value="pricing">Partner pricing</TabsTrigger>
        <TabsTrigger value="fx">Partner FX</TabsTrigger>
        <TabsTrigger value="customer">Customer pricing</TabsTrigger>
        <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
        <TabsTrigger value="strategy">Routing strategy</TabsTrigger>
        <TabsTrigger value="live">Live routing</TabsTrigger>
        <TabsTrigger value="simulator">Simulator</TabsTrigger>
        <TabsTrigger value="readiness">Readiness</TabsTrigger>
        <TabsTrigger value="attempts">Attempts</TabsTrigger>
        <TabsTrigger value="profitability">Profitability</TabsTrigger>
        <TabsTrigger value="cost">Cost assurance</TabsTrigger>
      </TabsList>
    </div>




    <TabsContent value="partners">
      <SectionBoundary name="PartnersPanel"><PartnersPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="corridors">
      <SectionBoundary name="PartnerCorridorsPanel"><PartnerCorridorsPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="pricing">
      <SectionBoundary name="PartnerPricingPanel"><PartnerPricingPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="fx">
      <SectionBoundary name="PartnerFxRatesPanel"><PartnerFxRatesPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="customer">
      <SectionBoundary name="EfinPricingPanel"><EfinPricingPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="liquidity">
      <SectionBoundary name="PartnerLiquidityPanel"><PartnerLiquidityPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="strategy">
      <SectionBoundary name="RoutingStrategyPanel"><RoutingStrategyPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="live">
      <SectionBoundary name="LiveRoutingControlPanel"><LiveRoutingControlPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="simulator">
      <SectionBoundary name="RouteSimulatorPanel"><RouteSimulatorPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="attempts">
      <SectionBoundary name="RoutingAttemptsPanel"><RoutingAttemptsPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="readiness">
      <SectionBoundary name="CorridorReadinessPanel"><CorridorReadinessPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="profitability">
      <SectionBoundary name="ProfitabilityPanel"><ProfitabilityPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="cost">
      <SectionBoundary name="CostAssurancePanel"><CostAssurancePanel /></SectionBoundary>
    </TabsContent>
  </Tabs>
);

export default PartnerNetworkPanel;
