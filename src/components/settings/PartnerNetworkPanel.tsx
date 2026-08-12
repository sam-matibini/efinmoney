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
import NetworkActivationPanel from "./partners/NetworkActivationPanel";
import PartnerLimitsPanel from "./partners/PartnerLimitsPanel";
import PartnerAlertsPanel from "./partners/PartnerAlertsPanel";
import PartnerSettlementsPanel from "./partners/PartnerSettlementsPanel";
import MarginGuardrailsPanel from "./partners/MarginGuardrailsPanel";
import PricingRecommendationsPanel from "./partners/PricingRecommendationsPanel";
import FeeAdjustmentsPanel from "./partners/FeeAdjustmentsPanel";
import PartnerScorecardsPanel from "./partners/PartnerScorecardsPanel";
import CorridorForecastPanel from "./partners/CorridorForecastPanel";
import LiquidityForecastPanel from "./partners/LiquidityForecastPanel";
import PartnerIncidentsPanel from "./partners/PartnerIncidentsPanel";
import CorridorRailsPanel from "./partners/CorridorRailsPanel";
import ApiPartnersPanel from "./partners/ApiPartnersPanel";




export const PartnerNetworkPanel = () => (
  <Tabs defaultValue="rails" className="space-y-4">
    <div className="overflow-x-auto pb-2">
      <TabsList className="inline-flex w-auto">
        <TabsTrigger value="rails">Corridor rails</TabsTrigger>
        <TabsTrigger value="partners">Partners</TabsTrigger>
        <TabsTrigger value="corridors">Corridors</TabsTrigger>
        <TabsTrigger value="activation">Activation</TabsTrigger>
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
        <TabsTrigger value="settlements">Settlements</TabsTrigger>

        <TabsTrigger value="guardrails">Guardrails</TabsTrigger>
        <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        <TabsTrigger value="fee-adjustments">Fee adjustments</TabsTrigger>
        <TabsTrigger value="scorecards">Scorecards</TabsTrigger>
        <TabsTrigger value="forecast">Forecast</TabsTrigger>
        <TabsTrigger value="runway">Float runway</TabsTrigger>
        <TabsTrigger value="incidents">Incidents</TabsTrigger>

        <TabsTrigger value="limits">Limits</TabsTrigger>

        <TabsTrigger value="api">API partners</TabsTrigger>

        <TabsTrigger value="alerts">Alerts</TabsTrigger>
      </TabsList>
    </div>





    <TabsContent value="rails">
      <SectionBoundary name="CorridorRailsPanel"><CorridorRailsPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="partners">
      <SectionBoundary name="PartnersPanel"><PartnersPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="corridors">
      <SectionBoundary name="PartnerCorridorsPanel"><PartnerCorridorsPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="activation">
      <SectionBoundary name="NetworkActivationPanel"><NetworkActivationPanel /></SectionBoundary>
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
    <TabsContent value="settlements">
      <SectionBoundary name="PartnerSettlementsPanel"><PartnerSettlementsPanel /></SectionBoundary>
    </TabsContent>

    <TabsContent value="guardrails">
      <SectionBoundary name="MarginGuardrailsPanel"><MarginGuardrailsPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="recommendations">
      <SectionBoundary name="PricingRecommendationsPanel"><PricingRecommendationsPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="fee-adjustments">
      <SectionBoundary name="FeeAdjustmentsPanel"><FeeAdjustmentsPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="scorecards">
      <SectionBoundary name="PartnerScorecardsPanel"><PartnerScorecardsPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="forecast">
      <SectionBoundary name="CorridorForecastPanel"><CorridorForecastPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="runway">
      <SectionBoundary name="LiquidityForecastPanel"><LiquidityForecastPanel /></SectionBoundary>
    </TabsContent>
    <TabsContent value="incidents">
      <SectionBoundary name="PartnerIncidentsPanel"><PartnerIncidentsPanel /></SectionBoundary>
    </TabsContent>

    <TabsContent value="limits">
      <SectionBoundary name="PartnerLimitsPanel"><PartnerLimitsPanel /></SectionBoundary>
    </TabsContent>

    <TabsContent value="api">
      <SectionBoundary name="ApiPartnersPanel"><ApiPartnersPanel /></SectionBoundary>
    </TabsContent>


    <TabsContent value="alerts">
      <SectionBoundary name="PartnerAlertsPanel"><PartnerAlertsPanel /></SectionBoundary>
    </TabsContent>
  </Tabs>
);

export default PartnerNetworkPanel;
