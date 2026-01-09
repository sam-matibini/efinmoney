import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  CheckCircle2, 
  Circle, 
  XCircle, 
  Clock, 
  PlayCircle,
  FileUp,
  ThumbsUp,
  ThumbsDown
} from "lucide-react";
import { useCustomerOnboarding, useOnboardingSteps } from "@/hooks/useCustomerOnboarding";

interface OnboardingProgressPanelProps {
  customerId: string;
  customerName?: string;
}

const statusConfig: Record<string, { icon: typeof Circle; color: string; label: string }> = {
  pending: { icon: Circle, color: 'text-muted-foreground', label: 'Pending' },
  in_progress: { icon: Clock, color: 'text-amber-500', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'text-primary', label: 'Completed' },
  rejected: { icon: XCircle, color: 'text-destructive', label: 'Rejected' },
};

export const OnboardingProgressPanel = ({ customerId, customerName }: OnboardingProgressPanelProps) => {
  const { data: steps = [] } = useOnboardingSteps();
  const { 
    onboarding, 
    isLoading, 
    initializeOnboarding, 
    updateStepStatus,
    reviewStep,
    progress, 
    completedSteps, 
    totalSteps,
    isPending 
  } = useCustomerOnboarding(customerId);
  
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedStep, setSelectedStep] = useState<{ id: string; name: string } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const handleStartOnboarding = () => {
    if (steps.length > 0) {
      initializeOnboarding(steps);
    }
  };

  const handleReview = (approved: boolean) => {
    if (selectedStep) {
      reviewStep({ 
        onboardingId: selectedStep.id, 
        approved, 
        notes: reviewNotes 
      });
      setReviewDialogOpen(false);
      setReviewNotes('');
      setSelectedStep(null);
    }
  };

  const openReviewDialog = (step: { id: string; name: string }) => {
    setSelectedStep(step);
    setReviewDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading onboarding status...
        </CardContent>
      </Card>
    );
  }

  const hasOnboarding = onboarding.length > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              Onboarding Progress {customerName && `- ${customerName}`}
            </CardTitle>
            {hasOnboarding && (
              <p className="text-sm text-muted-foreground mt-1">
                {completedSteps} of {totalSteps} steps completed
              </p>
            )}
          </div>
          {!hasOnboarding && (
            <Button onClick={handleStartOnboarding} disabled={isPending || steps.length === 0}>
              <PlayCircle className="w-4 h-4 mr-2" />
              Start Onboarding
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!hasOnboarding ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Onboarding not yet started for this customer.</p>
              <p className="text-sm mt-1">Click "Start Onboarding" to initialize the process.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Progress value={progress} className="h-2" />
              
              <div className="space-y-2">
                {onboarding.map((item, index) => {
                  const step = item.step;
                  const config = statusConfig[item.status] || statusConfig.pending;
                  const Icon = config.icon;
                  
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        item.status === 'completed' ? 'bg-primary/5 border-primary/20' : 
                        item.status === 'rejected' ? 'bg-destructive/5 border-destructive/20' :
                        'bg-background'
                      }`}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
                        {index + 1}
                      </div>
                      <Icon className={`w-5 h-5 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{step?.name}</p>
                          {step?.is_required && (
                            <Badge variant="outline" className="text-xs">Required</Badge>
                          )}
                          {step?.requires_document && (
                            <FileUp className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                        {step?.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-amber-600 mt-1">Note: {item.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={item.status === 'completed' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {config.label}
                        </Badge>
                        {item.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateStepStatus({ 
                              onboardingId: item.id, 
                              status: 'in_progress' 
                            })}
                          >
                            Start
                          </Button>
                        )}
                        {item.status === 'in_progress' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReviewDialog({ id: item.id, name: step?.name || '' })}
                          >
                            Review
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Step: {selectedStep?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Review Notes</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any notes about this review..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="destructive"
                onClick={() => handleReview(false)}
              >
                <ThumbsDown className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button onClick={() => handleReview(true)}>
                <ThumbsUp className="w-4 h-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
