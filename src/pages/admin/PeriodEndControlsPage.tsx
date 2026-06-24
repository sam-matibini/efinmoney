import { PeriodEndControlsPanel } from "@/components/finance/PeriodEndControlsPanel";

export default function PeriodEndControlsPage() {
  return (
    <div className="container px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Period-End Controls</h1>
        <p className="text-muted-foreground">Month-end close workflow — checklists, period locks, and controller sign-off</p>
      </div>
      <PeriodEndControlsPanel />
    </div>
  );
}
