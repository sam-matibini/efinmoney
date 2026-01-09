import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Mail, Calendar, FileText, CheckCircle2, Clock, Plus } from "lucide-react";
import { useCrmActivities } from "@/hooks/useCrmActivities";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface CrmActivitiesPanelProps {
  customerId: string;
  customerName?: string;
}

const activityTypes = [
  { value: 'call', label: 'Phone Call', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'meeting', label: 'Meeting', icon: Calendar },
  { value: 'note', label: 'Note', icon: FileText },
  { value: 'task', label: 'Task', icon: CheckCircle2 },
];

export const CrmActivitiesPanel = ({ customerId, customerName }: CrmActivitiesPanelProps) => {
  const { user } = useAuth();
  const { activities, isLoading, createActivity, completeActivity, isPending } = useCrmActivities(customerId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    activity_type: 'note',
    subject: '',
    description: '',
    due_date: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createActivity({
      customer_id: customerId,
      activity_type: formData.activity_type,
      subject: formData.subject,
      description: formData.description || null,
      due_date: formData.due_date || null,
      completed_at: formData.activity_type === 'note' ? new Date().toISOString() : null,
      assigned_to: user?.id || null,
      created_by: user?.id || null,
    });
    setFormData({ activity_type: 'note', subject: '', description: '', due_date: '' });
    setIsDialogOpen(false);
  };

  const getActivityIcon = (type: string) => {
    const activity = activityTypes.find(a => a.value === type);
    return activity?.icon || FileText;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">
          Activities {customerName && `- ${customerName}`}
        </CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Activity</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Activity Type</Label>
                <Select
                  value={formData.activity_type}
                  onValueChange={(v) => setFormData({ ...formData, activity_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activityTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <span className="flex items-center gap-2">
                          <type.icon className="w-4 h-4" />
                          {type.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              {formData.activity_type === 'task' && (
                <div className="space-y-2">
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input
                    id="due_date"
                    type="datetime-local"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  Save Activity
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading activities...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No activities yet. Log your first interaction!
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {activities.map(activity => {
              const Icon = getActivityIcon(activity.activity_type);
              const isCompleted = !!activity.completed_at;
              
              return (
                <div
                  key={activity.id}
                  className={`flex gap-3 p-3 rounded-lg border ${
                    isCompleted ? 'bg-muted/30' : 'bg-background'
                  }`}
                >
                  <div className={`p-2 rounded-full ${
                    isCompleted ? 'bg-primary/10 text-primary' : 'bg-muted'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{activity.subject}</p>
                        {activity.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {activity.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activity.activity_type === 'task' && !isCompleted && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => completeActivity(activity.id)}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Badge variant={isCompleted ? 'default' : 'secondary'} className="text-xs">
                          {activity.activity_type}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}</span>
                      {activity.due_date && !isCompleted && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock className="w-3 h-3" />
                          Due: {format(new Date(activity.due_date), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
