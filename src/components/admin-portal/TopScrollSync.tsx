import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * Wraps a horizontally scrollable area and renders a second scrollbar on top,
 * kept in sync with the content below — so wide tables can be scrolled
 * without first scrolling to the bottom of the page.
 */
const TopScrollSync = ({ children, className }: { children: ReactNode; className?: string }) => {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [width, setWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.scrollWidth);
      setOverflowing(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [children]);

  const mirror = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  };

  return (
    <div className={className}>
      <div
        ref={topRef}
        onScroll={() => mirror(topRef.current, bodyRef.current)}
        className="overflow-x-auto overflow-y-hidden"
        style={{ height: overflowing ? 12 : 0 }}
        aria-hidden
      >
        <div style={{ width, height: 1 }} />
      </div>
      <div
        ref={bodyRef}
        onScroll={() => mirror(bodyRef.current, topRef.current)}
        className="overflow-x-auto"
      >
        {children}
      </div>
    </div>
  );
};

export default TopScrollSync;
