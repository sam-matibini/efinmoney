import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  label: string;
  accept?: string;
  maxSizeMb?: number;
  uploadedPath?: string | null;
  uploadedPreviewUrl?: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => void;
  className?: string;
}

const DocumentUploader = ({
  label,
  accept = ".jpg,.jpeg,.png,.pdf,.tif,.tiff,.heic,.heif,.webp,.doc,.docx,.xls,.xlsx",
  maxSizeMb = 10,
  uploadedPath,
  uploadedPreviewUrl,
  onUpload,
  onRemove,
  className,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    const size = file.size / (1024 * 1024);
    if (size > maxSizeMb) return `File too large (max ${maxSizeMb}MB)`;
    const okTypes = accept.split(",").map((t) => t.trim().toLowerCase());
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!okTypes.includes(ext)) return "Unsupported file type";
    return null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const err = validate(file);
      if (err) {
        toast.error(err);
        return;
      }
      setFileName(file.name);
      if (file.type.startsWith("image/")) {
        setLocalPreview(URL.createObjectURL(file));
      } else {
        setLocalPreview(null);
      }
      setBusy(true);
      try {
        let attempt = 0;
        while (attempt < 3) {
          try {
            await onUpload(file);
            break;
          } catch (e) {
            attempt++;
            if (attempt >= 3) throw e;
            await new Promise((r) => setTimeout(r, 800 * attempt));
          }
        }
      } catch (e) {
        toast.error("Hmm, something went wrong. Please try again.");
        setLocalPreview(null);
        setFileName(null);
      } finally {
        setBusy(false);
      }
    },
    [onUpload]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const hasUpload = !!uploadedPath || !!localPreview;
  const previewSrc = uploadedPreviewUrl || localPreview;

  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all",
          "hover:border-primary/50 hover:bg-secondary/30",
          dragActive && "border-primary bg-primary/5",
          hasUpload && "border-primary/40 bg-primary/5"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {busy ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
          </div>
        ) : hasUpload ? (
          <div className="flex flex-col items-center gap-3">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt={label}
                className="max-h-40 rounded-lg object-contain"
              />
            ) : (
              <FileText className="w-10 h-10 text-primary" />
            )}
            <div className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-indigo-500" />
              <span className="truncate max-w-[200px]">
                {fileName || "Uploaded"}
              </span>
            </div>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalPreview(null);
                  setFileName(null);
                  onRemove();
                }}
              >
                <X className="w-4 h-4 mr-1" /> Replace
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Drop your file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              {accept.toUpperCase().replace(/\./g, "")} · up to {maxSizeMb}MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentUploader;
