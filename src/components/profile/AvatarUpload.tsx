import { Camera, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { useProfile } from "@/hooks/useProfile";
import { avatarInitials, resolveAvatarUrl } from "@/lib/avatar";

export function AvatarUpload() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { inputRef, pickFile, handleFileChange, removeAvatar, isUploading } = useAvatarUpload();

  const url = resolveAvatarUrl(profile, user);
  const initials = avatarInitials(profile, user);

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20 border-2 border-primary/20">
        <AvatarImage src={url ?? undefined} alt="Profile photo" />
        <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button type="button" variant="default" size="sm" onClick={pickFile} disabled={isUploading}>
          <Camera className="w-4 h-4 mr-2" />
          {isUploading ? "Uploading…" : url ? "Change photo" : "Add photo"}
        </Button>
        {url ? (
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={removeAvatar}>
            <Trash2 className="w-4 h-4 mr-2" />
            Remove photo
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">Shown in the top navigation bar.</p>
      </div>
    </div>
  );
}
