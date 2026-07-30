import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { listKybMessages, postKybMessage } from "@/lib/kybAdmin";

const ApplicantKybMessages = ({ businessId }: { businessId: string }) => {
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["applicant-kyb-messages", businessId],
    enabled: !!businessId,
    queryFn: () => listKybMessages(businessId),
  });

  const send = useMutation({
    mutationFn: async (text: string) => {
      await postKybMessage(businessId, text, "applicant");
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["applicant-kyb-messages", businessId] });
    },
  });

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Messages from our team</p>
          <p className="text-xs text-muted-foreground">
            Anything we need from you or updates on your application will appear here.
          </p>
        </div>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (data || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {data!.map((m) => {
              const fromAdmin = m.author_role === "admin";
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border p-3 ${
                    fromAdmin ? "bg-primary/5 border-primary/20" : "bg-muted/40"
                  }`}
                >
                  <p className="text-xs text-muted-foreground">
                    {fromAdmin ? "Compliance team" : "You"} ·{" "}
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                  <p className="text-sm whitespace-pre-wrap mt-1">{m.body}</p>
                </div>
              );
            })}
          </div>
        )}
        <div className="space-y-2 pt-2 border-t">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Reply to the compliance team..."
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!body.trim() || send.isPending}
              onClick={() => send.mutate(body)}
            >
              <Send className="w-4 h-4 mr-1" /> Send
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ApplicantKybMessages;
