import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { getAttachmentUrl, type Attachment } from "@/hooks/useSupport";

/** Renders a single support attachment: image preview or downloadable file chip.
 *  Resolves a short-lived signed URL from the private storage bucket. */
export default function AttachmentItem({ a }: { a: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { getAttachmentUrl(a.path).then(setUrl); }, [a.path]);

  const isImage = a.type.startsWith("image/");

  if (!url) return (
    <span className="inline-flex items-center gap-1 text-xs bg-black/10 rounded px-2 py-1 animate-pulse">
      <FileText className="w-3 h-3" /> {a.name}
    </span>
  );

  return isImage ? (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-1.5">
      <img src={url} alt={a.name} className="max-h-48 rounded-lg object-cover border border-black/10" />
    </a>
  ) : (
    <a
      href={url} target="_blank" rel="noreferrer" download={a.name}
      className="inline-flex items-center gap-1.5 text-xs bg-black/10 hover:bg-black/20 rounded-lg px-2.5 py-1.5 mt-1 transition-colors"
    >
      <Download className="w-3 h-3" /> {a.name}
    </a>
  );
}
