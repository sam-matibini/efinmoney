import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storageKey";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Paperclip, Upload, Trash2, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type ParentType = "bill" | "po" | "expense_claim" | "expense_item" | "grn" | "quick_expense";

interface Props {
  parentType: ParentType;
  parentId: string;
  compact?: boolean;
}

export const AttachmentsPanel = ({ parentType, parentId, compact }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: files = [] } = useQuery({
    queryKey: ["attachments", parentType, parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_attachments")
        .select("*")
        .eq("parent_type", parentType)
        .eq("parent_id", parentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!parentId,
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) throw new Error("Not signed in");
      if (file.size > 15 * 1024 * 1024) throw new Error("Max 15MB");
      const path = `${user.id}/${parentType}/${parentId}/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("purchase-documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error: rErr } = await supabase.from("purchase_attachments").insert({
        parent_type: parentType,
        parent_id: parentId,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.id,
      });
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", parentType, parentId] });
      toast.success("File uploaded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (row: any) => {
      await supabase.storage.from("purchase-documents").remove([row.file_path]);
      const { error } = await supabase.from("purchase_attachments").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", parentType, parentId] });
      toast.success("Removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const open = async (row: any) => {
    const { data } = await supabase.storage
      .from("purchase-documents")
      .createSignedUrl(row.file_path, 60 * 10);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="w-4 h-4" /> Attachments ({files.length})
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadMut.mutate(f);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={uploadMut.isPending}
      >
        <Upload className="w-3 h-3 mr-1" />
        {uploadMut.isPending ? "Uploading…" : "Add file"}
      </Button>
      {files.length > 0 && (
        <div className="space-y-1 text-xs">
          {files.map((f: any) => (
            <div key={f.id} className="flex items-center justify-between bg-muted/30 px-2 py-1 rounded">
              <button onClick={() => open(f)} className="flex items-center gap-2 truncate hover:underline">
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{f.file_name}</span>
                <ExternalLink className="w-3 h-3 opacity-50" />
              </button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteMut.mutate(f)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
