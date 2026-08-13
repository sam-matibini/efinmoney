import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarClock, Check, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import {
  ACTIVITY_TYPES,
  prettyLabel,
  useDeletePartnerCrmActivity,
  usePartnerContacts,
  usePartnerCrmActivities,
  useSavePartnerCrmActivity,
  type PartnerCrmActivity,
} from "@/hooks/usePartnerCrm";

const NO_CONTACT = "__none__";

const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const emptyDraft = (partnerId: string): Partial<PartnerCrmActivity> => ({
  partner_id: partnerId,
  activity_type: "call",
  subject: "",
  occurred_at: new Date().toISOString(),
});

/** Relationship log: calls, emails, meetings, negotiations and follow-ups. */
export const PartnerActivityTab = ({ partnerId }: { partnerId: string }) => {
  const { data: activities, isLoading } = usePartnerCrmActivities(partnerId);
  const { data: contacts } = usePartnerContacts(partnerId);
  const save = useSavePartnerCrmActivity();
  const remove = useDeletePartnerCrmActivity();
  const [draft, setDraft] = useState<Partial<PartnerCrmActivity> | null>(null);

  const set = (patch: Partial<PartnerCrmActivity>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));

  const openFollowUps = useMemo(
    () => (activities ?? []).filter((a) => a.follow_up_at && !a.follow_up_done),
    [activities],
  );

  const contactName = (id: string | null) =>
    id ? contacts?.find((c) => c.id === id)?.full_name ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Every interaction with this partner, plus open follow-ups.</p>
        <Button size="sm" onClick={() => setDraft(emptyDraft(partnerId))}>
          <Plus className="mr-1 h-4 w-4" /> Log activity
        </Button>
      </div>

      {openFollowUps.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4" /> Open follow-ups ({openFollowUps.length})
          </p>
          <ul className="space-y-1">
            {openFollowUps.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {new Date(a.follow_up_at!).toLocaleDateString()} · {a.subject}
                  {a.follow_up_owner ? ` · ${a.follow_up_owner}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => save.mutate({ id: a.id, follow_up_done: true })}
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> Done
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !activities?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <div key={a.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{a.subject}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {prettyLabel(a.activity_type)}
                    </Badge>
                    {a.follow_up_at && !a.follow_up_done ? (
                      <Badge className="bg-amber-500 text-[10px] text-white hover:bg-amber-500">follow-up</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(a.occurred_at).toLocaleString()}
                    {contactName(a.contact_id) ? ` · ${contactName(a.contact_id)}` : ""}
                  </p>
                  {a.body ? <p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p> : null}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setDraft(a)} aria-label="Edit activity">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)} aria-label="Delete activity">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit activity" : "Log activity"}</DialogTitle>
            <DialogDescription>Keep a record of what was agreed and what happens next.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Type</Label>
                <Select value={draft.activity_type ?? "call"} onValueChange={(v) => set({ activity_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {prettyLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>When</Label>
                <Input
                  type="datetime-local"
                  value={toLocalInput(draft.occurred_at)}
                  onChange={(e) => set({ occurred_at: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Subject</Label>
                <Input value={draft.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Details</Label>
                <Textarea rows={4} value={draft.body ?? ""} onChange={(e) => set({ body: e.target.value })} />
              </div>
              <div>
                <Label>Contact</Label>
                <Select
                  value={draft.contact_id ?? NO_CONTACT}
                  onValueChange={(v) => set({ contact_id: v === NO_CONTACT ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CONTACT}>None</SelectItem>
                    {(contacts ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Follow-up date</Label>
                <Input
                  type="date"
                  value={draft.follow_up_at ? draft.follow_up_at.slice(0, 10) : ""}
                  onChange={(e) =>
                    set({ follow_up_at: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Follow-up owner</Label>
                <Input
                  value={draft.follow_up_owner ?? ""}
                  onChange={(e) => set({ follow_up_owner: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => draft && save.mutate(draft, { onSuccess: () => setDraft(null) })}
              disabled={!draft?.subject?.trim() || save.isPending}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerActivityTab;
