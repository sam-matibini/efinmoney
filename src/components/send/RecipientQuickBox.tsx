import { UserPlus } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onQuickAdd: () => void;
  placeholder?: string;
};

/** Sendwave-style boxed recipient field with an inline quick-add action. */
export default function RecipientQuickBox({ value, onChange, onQuickAdd, placeholder = "Recipient name" }: Props) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5 focus-within:border-primary transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Recipient
          </div>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\p{L}\p{M}'\-. ]/gu, "").slice(0, 100))}
            maxLength={100}
            placeholder={placeholder}
            className="w-full border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <button
          type="button"
          onClick={onQuickAdd}
          aria-label="Quick add new recipient"
          title="Quick add new recipient"
          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <UserPlus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
