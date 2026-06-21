import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { AVATAR_BUCKET, avatarStoragePath } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";

function extFromFile(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  return "jpg";
}

async function uploadAvatarFile(userId: string, file: File) {
  const ext = extFromFile(file);
  const path = avatarStoragePath(userId, ext);

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("user_id", userId);

  if (profileError) throw profileError;
  return publicUrl;
}

export function useAvatarUpload() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not signed in");
      if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB");
      return uploadAvatarFile(user.id, file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile photo updated");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Could not upload photo");
    },
  });

  const pickFile = () => inputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) mutation.mutate(file);
  };

  const removeAvatar = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Profile photo removed");
  };

  return {
    inputRef,
    pickFile,
    handleFileChange,
    removeAvatar,
    isUploading: mutation.isPending,
  };
}
