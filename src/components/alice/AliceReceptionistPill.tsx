import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALICE_ACCENT, ALICE_BRAND, ALICE_BRAND_SOFT } from "@/components/alice/aliceAdvisorTheme";

interface Props extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Short label — ClearBank style: "Ask ClearBank's AI Expert" */
  label?: string;
  /** Compact icon-only on very small screens when false. */
  alwaysShowLabel?: boolean;
  onClick?: () => void;
}

const STORAGE_KEY = "efm_alice_pill_pos";
/** Keep clear of mobile bottom nav (~5.5rem) + safe area + gap. */
const DEFAULT_BOTTOM_CLEARANCE = 96;
const EDGE_PAD = 12;
const DRAG_THRESHOLD = 8;

type Pos = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultPos(w: number, h: number): Pos {
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  return {
    x: clamp(vw - w - EDGE_PAD, EDGE_PAD, Math.max(EDGE_PAD, vw - w - EDGE_PAD)),
    y: clamp(vh - h - DEFAULT_BOTTOM_CLEARANCE, EDGE_PAD, Math.max(EDGE_PAD, vh - h - EDGE_PAD)),
  };
}

function readStoredPos(w: number, h: number): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: clamp(parsed.x, EDGE_PAD, Math.max(EDGE_PAD, vw - w - EDGE_PAD)),
      y: clamp(parsed.y, EDGE_PAD, Math.max(EDGE_PAD, vh - h - EDGE_PAD)),
    };
  } catch {
    return null;
  }
}

/**
 * Receptionist entry pill — brand indigo glow + amber spark accents.
 * Draggable so it does not sit on the mobile bottom navbar.
 */
const AliceReceptionistPill = forwardRef<HTMLButtonElement, Props>(function AliceReceptionistPill(
  {
    label = "Ask Alice's AI Expert",
    alwaysShowLabel = true,
    className,
    type = "button",
    onClick,
    ...rest
  },
  ref,
) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const posRef = useRef<Pos | null>(null);
  const drag = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    pointerId: number;
  } | null>(null);

  const updatePos = useCallback((next: Pos) => {
    posRef.current = next;
    setPos(next);
  }, []);

  const setRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      btnRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const measureAndPlace = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const w = width || 200;
    const h = height || 56;
    updatePos(readStoredPos(w, h) ?? defaultPos(w, h));
  }, [updatePos]);

  useEffect(() => {
    measureAndPlace();
    const onResize = () => {
      const el = btnRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      const w = width || 200;
      const h = height || 56;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const prev = posRef.current;
      const next = prev
        ? {
            x: clamp(prev.x, EDGE_PAD, Math.max(EDGE_PAD, vw - w - EDGE_PAD)),
            y: clamp(prev.y, EDGE_PAD, Math.max(EDGE_PAD, vh - h - EDGE_PAD)),
          }
        : defaultPos(w, h);
      updatePos(next);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureAndPlace, updatePos]);

  const persist = (next: Pos) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = btnRef.current;
    const current = posRef.current ?? pos;
    if (!el || !current) return;
    el.setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originX: current.x,
      originY: current.y,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d?.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    const el = btnRef.current;
    const w = el?.offsetWidth || 200;
    const h = el?.offsetHeight || 56;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    updatePos({
      x: clamp(d.originX + dx, EDGE_PAD, Math.max(EDGE_PAD, vw - w - EDGE_PAD)),
      y: clamp(d.originY + dy, EDGE_PAD, Math.max(EDGE_PAD, vh - h - EDGE_PAD)),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d?.active) return;
    const moved = d.moved;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (moved) {
      if (posRef.current) persist(posRef.current);
      return;
    }
    onClick?.();
  };

  return (
    <button
      ref={setRefs}
      type={type}
      aria-label={label}
      title="Drag to move · tap to open"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "group fixed z-[60] flex items-center gap-2.5 rounded-full border border-black/5 bg-white pl-1.5 pr-4 py-1.5",
        "shadow-[0_8px_28px_rgba(26,15,60,0.14)] touch-none select-none",
        "hover:shadow-[0_12px_32px_rgba(26,15,60,0.2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,184,0,0.55)]",
        "cursor-grab active:cursor-grabbing",
        !pos && "right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6",
        className,
      )}
      style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
      {...rest}
    >
      <span
        className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 25%, #efe8ff 0%, #d4c4ff 40%, ${ALICE_BRAND_SOFT} 100%)`,
          boxShadow: `0 0 0 1px ${ALICE_ACCENT}88, 0 0 18px ${ALICE_ACCENT}55`,
        }}
      >
        <Mic className="h-4 w-4 text-white" strokeWidth={2.25} aria-hidden />
        <span className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="absolute left-[7px] top-[8px] h-1 w-1 rotate-45" style={{ background: ALICE_ACCENT }} />
          <span className="absolute right-[9px] top-[11px] h-[3px] w-[3px] rotate-45" style={{ background: ALICE_ACCENT }} />
          <span className="absolute bottom-[9px] right-[11px] h-1 w-1 rotate-45" style={{ background: ALICE_ACCENT }} />
        </span>
        <img
          src="/alice.png"
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className="absolute inset-0 h-full w-full object-cover object-top opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      </span>
      <span
        className={cn(
          "pr-1 text-sm font-medium tracking-tight",
          !alwaysShowLabel && "hidden sm:inline",
        )}
        style={{ color: ALICE_BRAND }}
      >
        {label}
      </span>
    </button>
  );
});

export default AliceReceptionistPill;
