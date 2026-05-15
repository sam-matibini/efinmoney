import { useState, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import FlipCard from "./FlipCard";
import type { Card as CardRow } from "@/hooks/useCards";

interface Props {
  cards: CardRow[];
  flipped: Record<string, boolean>;
  onToggleFlip: (id: string) => void;
  renderActions: (card: CardRow) => React.ReactNode;
  onAddCard?: () => void;
}

const CardStack = ({ cards, flipped, onToggleFlip, renderActions, onAddCard }: Props) => {
  const [active, setActive] = useState(0);
  const total = cards.length + (onAddCard ? 1 : 0);
  const containerRef = useRef<HTMLDivElement>(null);

  const go = (i: number) => {
    if (i < 0 || i >= total) return;
    setActive(i);
  };

  const next = () => go(Math.min(active + 1, total - 1));
  const prev = () => go(Math.max(active - 1, 0));

  const onDragEnd = (_: any, info: PanInfo) => {
    const threshold = 60;
    if (info.offset.x < -threshold) next();
    else if (info.offset.x > threshold) prev();
  };

  const activeCard = active < cards.length ? cards[active] : null;
  const isAddSlot = active === cards.length && onAddCard;

  const networkLabel = (c: CardRow) =>
    c.card_network === "visa" ? "Visa" : "Mastercard";
  const typeLabel = (c: CardRow) =>
    c.card_type === "virtual" ? "Virtual" : "Physical";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Counter */}
      <div className="text-center mb-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {isAddSlot
            ? "Add a new card"
            : `Card ${active + 1} of ${cards.length}`}
        </p>
      </div>

      {/* Carousel viewport */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ height: 280, perspective: 1400 }}
      >
        {/* Arrows */}
        {total > 1 && (
          <>
            <button
              onClick={prev}
              disabled={active === 0}
              aria-label="Previous card"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-background/90 backdrop-blur border shadow-md flex items-center justify-center hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              disabled={active === total - 1}
              aria-label="Next card"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-background/90 backdrop-blur border shadow-md flex items-center justify-center hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={onDragEnd}
        >
          {Array.from({ length: total }).map((_, i) => {
            const offset = i - active;
            const abs = Math.abs(offset);
            if (abs > 2) return null;

            const isActive = offset === 0;
            const card = i < cards.length ? cards[i] : null;

            return (
              <motion.div
                key={card?.id ?? "add-slot"}
                className="absolute w-[78%] sm:w-[64%] max-w-md"
                animate={{
                  x: `${offset * 70}%`,
                  scale: isActive ? 1 : 0.92,
                  opacity: isActive ? 1 : 0.55,
                  rotateY: offset * -8,
                  zIndex: 10 - abs,
                }}
                transition={{ type: "spring", stiffness: 220, damping: 28 }}
                onClick={() => {
                  if (!isActive) go(i);
                }}
                style={{
                  pointerEvents: abs > 1 ? "none" : "auto",
                  cursor: isActive ? "default" : "pointer",
                }}
              >
                {card ? (
                  <FlipCard
                    card={card}
                    flipped={!!flipped[card.id]}
                    onToggle={() => isActive && onToggleFlip(card.id)}
                    index={i}
                  />
                ) : (
                  <button
                    onClick={() => isActive && onAddCard?.()}
                    className="w-full aspect-[1.586/1] rounded-2xl border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-current flex items-center justify-center">
                      <Plus className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-medium">Add new card</span>
                  </button>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Dots */}
      {total > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-8 bg-primary" : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>
      )}

      {/* Thumbnail strip */}
      {cards.length > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2 overflow-x-auto pb-2 px-2">
          {cards.map((c, i) => {
            const isActive = i === active;
            const grad =
              c.card_network === "mastercard"
                ? "linear-gradient(135deg,#1a1a1a,#eb6e1f)"
                : "linear-gradient(135deg,#0a2540,#0f766e)";
            return (
              <button
                key={c.id}
                onClick={() => go(i)}
                aria-label={`Select ${networkLabel(c)} ending ${c.last_four}`}
                className={`shrink-0 rounded-lg p-[2px] transition-all ${
                  isActive
                    ? "ring-2 ring-primary shadow-[0_0_0_3px_rgba(16,185,129,0.15)] scale-105"
                    : "ring-1 ring-border opacity-70 hover:opacity-100"
                }`}
              >
                <div
                  className="w-20 h-12 rounded-md flex items-end justify-between p-1.5 text-white"
                  style={{ background: grad }}
                >
                  <span className="text-[8px] font-mono opacity-80">
                    ••{c.last_four}
                  </span>
                  <span className="text-[8px] font-display font-bold italic">
                    {c.card_network === "visa" ? "VISA" : "MC"}
                  </span>
                </div>
              </button>
            );
          })}
          {onAddCard && (
            <button
              onClick={() => go(cards.length)}
              aria-label="Add card slot"
              className={`shrink-0 w-20 h-12 rounded-md border-2 border-dashed flex items-center justify-center transition-all ${
                active === cards.length
                  ? "border-primary text-primary scale-105"
                  : "border-muted-foreground/40 text-muted-foreground hover:border-primary/60"
              }`}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Selected card name */}
      <AnimatePresence mode="wait">
        {activeCard && (
          <motion.p
            key={activeCard.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mt-5 text-center text-sm font-medium text-foreground"
          >
            {networkLabel(activeCard)} {typeLabel(activeCard)} •••• {activeCard.last_four}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Actions for active card */}
      <div className="mt-3">
        {activeCard ? (
          renderActions(activeCard)
        ) : (
          <div className="h-[68px]" />
        )}
      </div>
    </div>
  );
};

export default CardStack;
