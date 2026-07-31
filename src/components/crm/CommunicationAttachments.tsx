import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Paperclip, X, Download, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  attachmentDownloadUrl,
  formatBytes,
  removeCommunicationFile,
  uploadCommunicationFile,
  type StagedAttachment,
} from "@/lib/communications";

interface PickerProps {
  files: StagedAttachment[];
  onChange: (files: StagedAttachment[]) => void;
  disabled?: boolean;
}

/** Upload control used when composing a message or logging an interaction. */
export function AttachmentPicker({ files, onChange, disabled }: PickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    const uploaded: StagedAttachment[] = [];
    for (const file of Array.from(list)) {
      try {
        uploaded.push(await uploadCommunicationFile(file));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not upload ${file.name}`);
      }
    }
    if (uploaded.length) onChange([...files, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async (path: string) => {
    onChange(files.filter((f) => f.file_path !== path));
    await removeCommunicationFile(path).catch(() => undefined);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Paperclip className="w-4 h-4 mr-2" />
        )}
        Attach documents
      </Button>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.file_path}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.file_name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(f.size_bytes)}</span>
              </span>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(f.file_path)}>
                <X className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface StoredAttachment {
  id: string;
  file_name: string;
  file_path: string;
  size_bytes: number | null;
}

/** Read-only list of attachments already linked to a communication. */
export function AttachmentLinks({ attachments }: { attachments: StoredAttachment[] }) {
  if (!attachments.length) return null;

  const open = async (path: string) => {
    try {
      window.open(await attachmentDownloadUrl(path), "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open document");
    }
  };

  return (
    <ul className="mt-2 space-y-1">
      {attachments.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => open(a.file_path)}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="truncate">{a.file_name}</span>
            <span className="text-xs text-muted-foreground">{formatBytes(a.size_bytes)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Fetch attachments for a set of communications, grouped by communication id. */
export const useCommunicationAttachments = (communicationIds: string[]) =>
  useQuery({
    queryKey: ["communication-attachments", [...communicationIds].sort().join(",")],
    enabled: communicationIds.length > 0,
    queryFn: async (): Promise<Record<string, StoredAttachment[]>> => {
      const { data, error } = await supabase
        .from("communication_attachments")
        .select("id, communication_id, file_name, file_path, size_bytes")
        .in("communication_id", communicationIds);
      if (error) throw error;
      const grouped: Record<string, StoredAttachment[]> = {};
      for (const row of data || []) {
        (grouped[row.communication_id] ||= []).push(row as StoredAttachment);
      }
      return grouped;
    },
  });
