import { forwardRef, useState, MouseEvent, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Ripple = { id: number; x: number; y: number; size: number };

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {}

const RippleButton = forwardRef<HTMLButtonElement, Props>(
  ({ className, children, onClick, ...props }, ref) => {
    const [ripples, setRipples] = useState<Ripple[]>([]);

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const id = Date.now() + Math.random();
      setRipples((r) => [...r, { id, x, y, size }]);
      setTimeout(() => {
        setRipples((r) => r.filter((rp) => rp.id !== id));
      }, 600);
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        {...props}
        onClick={handleClick}
        className={cn("relative overflow-hidden", className)}
      >
        {children}
        {ripples.map((r) => (
          <span
            key={r.id}
            className="ripple-span"
            style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
          />
        ))}
      </button>
    );
  },
);

RippleButton.displayName = "RippleButton";
export default RippleButton;
