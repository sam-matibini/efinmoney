import { useRef, useState } from "react";
import { toast } from "sonner";
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
import { Download, FileText, Pencil, Trash2, Upload } from "lucide-react";
import {
  DOC_STATUSES,
  DOC_TYPES,
  docExpiryState,
  partnerDocumentUrl,
  prettyLabel,
  useDeletePartnerDocument,
  usePartnerDocuments,
  useSavePartnerDocument,
  useUploadPartnerDocument,
  type PartnerDocument,
} from "@/hooks/usePartnerCrm";
import { formatBytes } from "@/lib/communications";

const dateStr = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

const ExpiryBadge = ({ expiry }: { expiry: string | null }) => {
  const state = docExpiryState(expiry);
  if (state === "none") return null;
  if (state === "expired") return <Badge variant="destructive" className="text-[10px]">expired</Badge>;
  if (state === "soon") return <Badge className="bg-amber-500 text-[10px] text-white hover:bg-amber-500">expiring soon</Badge>;
  return null;
};

type MetaDraft = Partial<PartnerDocument>;

/** Agreements, rate schedules and compliance paperwork for a partner. */
export const PartnerDocumentsTab = ({ partnerId }: { partnerId: string }) => {
  const { data: docs, isLoading } = usePartnerDocuments(partnerId);
  const upload = useUploadPartnerDocument();
  const saveMeta = useSavePartnerDocument();
  const remove = useDeletePartnerDocument();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [supersedes, setSupersedes] = useState<string | undefined>();
  const [draft, setDraft] = useState<MetaDraft>({ doc_type: "agreement", status: "executed" });
  const [editing, setEditing] = useState<PartnerDocument | null>(null);

  const set = (patch: MetaDraft) => setDraft((d) => ({ ...d, ...patch }));

  const startUpload = (replacing?: PartnerDocument) => {
    setSupersedes(replacing?.id);
    setDraft(
      replacing
        ? {
            doc_type: replacing.doc_type,
            status: "executed",
            title: replacing.title,
            counterparty_signer: replacing.counterparty_signer,
          }
        : { doc_type: "agreement", status: "executed" },
    );
    setFile(null);
    setUploadOpen(true);
  };

  const submitUpload = () => {
    if (!file) {
      toast.error("Choose a file to upload");
      return;
    }
    upload.mutate(
      { partner_id: partnerId, file, meta: draft, supersedes },
      {
        onSuccess: () => {
          setUploadOpen(false);
          setFile(null);
          setSupersedes(undefined);
        },
      },
    );
  };

  const open = async (doc: PartnerDocument) => {
    try {
      window.open(await partnerDocumentUrl(doc.file_path), "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open document");
    }
  };

  const metaFields = (d: MetaDraft, onChange: (patch: MetaDraft) => void) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>Title</Label>
        <Input value={d.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div>
        <Label>Document type</Label>
        <Select value={d.doc_type ?? "agreement"} onValueChange={(v) => onChange({ doc_type: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {prettyLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Status</Label>
        <Select value={d.status ?? "executed"} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {prettyLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Version</Label>
        <Input placeholder="v1.0" value={d.version ?? ""} onChange={(e) => onChange({ version: e.target.value })} />
      </div>
      <div>
        <Label>Counterparty signer</Label>
        <Input
          value={d.counterparty_signer ?? ""}
          onChange={(e) => onChange({ counterparty_signer: e.target.value })}
        />
      </div>
      <div>
        <Label>Signed date</Label>
        <Input type="date" value={d.signed_date ?? ""} onChange={(e) => onChange({ signed_date: e.target.value })} />
      </div>
      <div>
        <Label>Effective date</Label>
        <Input
          type="date"
          value={d.effective_date ?? ""}
          onChange={(e) => onChange({ effective_date: e.target.value })}
        />
      </div>
      <div>
        <Label>Expiry / renewal date</Label>
        <Input type="date" value={d.expiry_date ?? ""} onChange={(e) => onChange({ expiry_date: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <Label>Notes</Label>
        <Textarea rows={2} value={d.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} />
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Signed agreements, rate schedules and compliance paperwork. Files are private and open through a
          short-lived link.
        </p>
        <Button size="sm" onClick={() => startUpload()}>
          <Upload className="mr-1 h-4 w-4" /> Upload document
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !docs?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No documents on file — upload this partner's agreement.
        </p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{d.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {prettyLabel(d.doc_type)}
                    </Badge>
                    <Badge variant={d.status === "executed" ? "default" : "secondary"} className="text-[10px]">
                      {prettyLabel(d.status)}
                    </Badge>
                    {d.version ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {d.version}
                      </Badge>
                    ) : null}
                    <ExpiryBadge expiry={d.expiry_date} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Signed {dateStr(d.signed_date)} · Effective {dateStr(d.effective_date)} · Expires{" "}
                    {dateStr(d.expiry_date)}
                    {d.counterparty_signer ? ` · Signed by ${d.counterparty_signer}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.file_name} {d.size_bytes ? `· ${formatBytes(d.size_bytes)}` : ""}
                  </p>
                  {d.notes ? <p className="mt-1 text-xs text-muted-foreground">{d.notes}</p> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button variant="outline" size="sm" onClick={() => open(d)}>
                    <Download className="mr-1 h-4 w-4" /> Open
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => startUpload(d)}>
                    New version
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(d)} aria-label="Edit document">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(d)} aria-label="Delete document">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{supersedes ? "Upload new version" : "Upload document"}</DialogTitle>
            <DialogDescription>
              {supersedes
                ? "The previous version stays on file and is marked superseded."
                : "Stored privately; only admins can open it."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>File</Label>
              <Input
                ref={fileRef}
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !draft.title) set({ title: f.name.replace(/\.[^.]+$/, "") });
                }}
              />
            </div>
            {metaFields(draft, set)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitUpload} disabled={upload.isPending}>
              {upload.isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit document details</DialogTitle>
            <DialogDescription>The stored file itself is unchanged.</DialogDescription>
          </DialogHeader>
          {editing
            ? metaFields(editing, (patch) => setEditing((e) => (e ? { ...e, ...patch } : e)))
            : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => editing && saveMeta.mutate(editing, { onSuccess: () => setEditing(null) })}
              disabled={saveMeta.isPending}
            >
              {saveMeta.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerDocumentsTab;
