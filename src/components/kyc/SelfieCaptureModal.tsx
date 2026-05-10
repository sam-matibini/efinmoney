import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCapture: (blob: Blob) => Promise<void>;
}

const SelfieCaptureModal = ({ open, onOpenChange, onCapture }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      stopStream();
      setCaptured(null);
      return;
    }
    start();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 640 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      toast.error("Camera access denied. Please enable camera permissions.");
      onOpenChange(false);
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    setCaptured(canvas.toDataURL("image/jpeg", 0.9));
    stopStream();
  };

  const retake = () => {
    setCaptured(null);
    start();
  };

  const confirm = async () => {
    if (!captured) return;
    setBusy(true);
    try {
      const res = await fetch(captured);
      const blob = await res.blob();
      await onCapture(blob);
      onOpenChange(false);
    } catch {
      toast.error("Could not save selfie. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Take a selfie</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Look at the camera and follow the instructions
        </p>
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-black">
          {captured ? (
            <img src={captured} alt="Selfie preview" className="w-full h-full object-cover" />
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-3/4 aspect-square rounded-full border-4 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {captured ? (
            <>
              <Button variant="outline" className="flex-1" onClick={retake} disabled={busy}>
                <RefreshCw className="w-4 h-4 mr-2" /> Retake
              </Button>
              <Button className="flex-1" onClick={confirm} disabled={busy}>
                <Check className="w-4 h-4 mr-2" /> {busy ? "Saving..." : "Use this"}
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={capture}>
              <Camera className="w-4 h-4 mr-2" /> Capture
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SelfieCaptureModal;
