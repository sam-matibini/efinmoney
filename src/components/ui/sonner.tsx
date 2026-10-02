import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/components/theme/ThemeProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Global toasts: bottom-right, max 3 stacked, 3s auto-dismiss, left border by type. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      visibleToasts={3}
      duration={3000}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-[var(--radius-md)] group-[.toaster]:border-l-4",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:!border-l-[var(--color-success)]",
          error: "group-[.toaster]:!border-l-[var(--color-danger)]",
          info: "group-[.toaster]:!border-l-[var(--color-accent-blue)]",
          warning: "group-[.toaster]:!border-l-[var(--color-accent-gold)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
