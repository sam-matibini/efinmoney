import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * Wraps a horizontally scrollable area and renders a second scrollbar on top,
 * kept in sync with the content below — so wide tables can be scrolled
 * without first scrolling to the bottom of the page.
 */
const TopScrollSync = ({ children, className }: { children: ReactNode; className?: string }) => {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<HTMLElement | null>(null);
  const syncing = useRef(false);
  const [width, setWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    const findScrollTarget = () => {
      const candidates = [body, ...Array.from(body.querySelectorAll<HTMLElement>("*"))];
      return candidates.reduce<HTMLElement>((widest, candidate) =>
        candidate.scrollWidth > widest.scrollWidth ? candidate : widest, body);
    };

    let target = findScrollTarget();
    scrollTargetRef.current = target;
    const measure = () => {
      target = findScrollTarget();
      scrollTargetRef.current = target;
      setWidth(target.scrollWidth);
      setOverflowing(target.scrollWidth > target.clientWidth + 1);
    };
    const syncFromTable = () => mirror(scrollTargetRef.current, topRef.current);

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    body.querySelectorAll<HTMLElement>("*").forEach((element) => ro.observe(element));
    target.addEventListener("scroll", syncFromTable, { passive: true });

    return () => {
      ro.disconnect();
      target.removeEventListener("scroll", syncFromTable);
      scrollTargetRef.current = null;
    };
  }, [children]);

  const mirror = (from: HTMLElement | null, to: HTMLElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  };

  return (
    <div className={className}>
      <div
        ref={topRef}
        onScroll={() => mirror(topRef.current, scrollTargetRef.current)}
        className="top-scrollbar overflow-x-scroll overflow-y-hidden mb-2"
        style={{ height: overflowing ? 18 : 0 }}
        aria-label="Scroll table horizontally"
      >
        <div style={{ width, height: 1 }} />
      </div>
      <div
        ref={bodyRef}
        className="min-w-0"
      >
        {children}
      </div>
    </div>
  );
};

export default TopScrollSync;
