import * as React from "react";
import { cn } from "@/lib/utils";

export interface FloatingLabelInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
}

const FloatingLabelInput = React.forwardRef<
  HTMLInputElement,
  FloatingLabelInputProps
>(({ className, label, helperText, type = "text", value, defaultValue, ...props }, ref) => {
  const [focused, setFocused] = React.useState(false);
  const hasValue =
    value !== undefined && value !== ""
      ? String(value).length > 0
      : defaultValue !== undefined && String(defaultValue).length > 0;
  const isActive = focused || hasValue;

  return (
    <div className={cn("relative group", className)}>
      <input
        type={type}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        className={cn(
          "peer h-14 w-full rounded-xl border bg-background px-4 pt-5 pb-1.5 text-sm text-foreground",
          "transition-all duration-200 ease-out",
          "placeholder:text-transparent",
          "focus-visible:outline-none",
          isActive
            ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.10),0_0_24px_-6px_hsl(var(--primary)/0.22)]"
            : "border-input shadow-card hover:border-muted-foreground/40",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        {...props}
      />
      <label
        className={cn(
          "absolute left-4 pointer-events-none origin-left",
          "text-muted-foreground transition-all duration-200 ease-out",
          isActive
            ? "top-2.5 text-[11px] font-medium text-primary"
            : "top-1/2 -translate-y-1/2 text-sm"
        )}
      >
        {label}
      </label>
      {helperText && (
        <p className="mt-1.5 text-xs text-muted-foreground px-1">{helperText}</p>
      )}
    </div>
  );
});

FloatingLabelInput.displayName = "FloatingLabelInput";

export { FloatingLabelInput };
