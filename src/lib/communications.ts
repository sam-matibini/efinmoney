import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export const COMMUNICATION_BUCKET = "communication-attachments";
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export interface ChannelMeta {
  label: string;
  /** Whether the platform can actually deliver on this channel today. */
  delivery: "live" | "logged";
  note?: string;
}

export const CHANNELS: Record<string, ChannelMeta> = {
  email: { label: "Email", delivery: "live" },
  in_app: { label: "In-app notification", delivery: "live" },
  sms: { label: "SMS", delivery: "logged", note: "No SMS provider connected — recorded only" },
  whatsapp: { label: "WhatsApp", delivery: "logged", note: "No WhatsApp provider connected — recorded only" },
  push: { label: "Push", delivery: "logged", note: "No push provider connected — recorded only" },
  phone_call: { label: "Phone call", delivery: "logged", note: "Recorded as a staff interaction" },
  meeting: { label: "Meeting", delivery: "logged", note: "Recorded as a staff interaction" },
  note: { label: "Internal note", delivery: "logged", note: "Recorded as a staff interaction" },
};

export interface StagedAttachment {
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number;
}

/** Upload a document to the private communications bucket. */
export async function uploadCommunicationFile(file: File): Promise<StagedAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is larger than 15 MB`);
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${crypto.randomUUID()}/${safeName}`;
  const { error } = await supabase.storage
    .from(COMMUNICATION_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(error.message);
  return {
    file_name: file.name,
    file_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
  };
}

export async function removeCommunicationFile(path: string) {
  await supabase.storage.from(COMMUNICATION_BUCKET).remove([path]);
}

/** Create a short-lived download link for a stored attachment. */
export async function attachmentDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(COMMUNICATION_BUCKET)
    .createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create download link");
  return data.signedUrl;
}

export interface SendCommunicationInput {
  channel: string;
  subject?: string;
  content: string;
  customer_id?: string | null;
  user_id?: string | null;
  recipient_email?: string | null;
  recipient_name?: string | null;
  attachments?: StagedAttachment[];
}

export async function sendCommunication(input: SendCommunicationInput) {
  return invokeEdgeFunction<{ success: boolean; communication_id: string; status: string }>(
    "send-communication",
    input as unknown as Record<string, unknown>,
  );
}

export const formatBytes = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
