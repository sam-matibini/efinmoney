import { useState } from "react";
import { motion } from "framer-motion";
import FlipCard from "./FlipCard";
import type { Card as CardRow } from "@/hooks/useCards";

interface Props {
  cards: CardRow[];
  flipped: Record<string, boolean>;
  onToggleFlip: (id: string) => void;
  renderActions: (card: CardRow) => React.ReactNode;
}

const CardStack = ({ cards, flipped, onToggleFlip, renderActions }: Props) => {
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);

  const activate = (i: number) => {
    if (i === active) {
      onToggleFlip(cards[i].id);
    } else {
      setActive(i);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div
        className="relative w-full"
        style={{ height: 320 }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {cards.map((card, i) => {
          const offset = (i - active + cards.length) % cards.length;
          // active = 0, then 1, 2, ... peek behind
          const isActive = offset === 0;
          const fan = hovering ? 14 : 8;
          return (
            <motion.div
              key={card.id}
              animate={{
                y: offset * fan,
                x: hovering && !isActive ? offset * 10 : 0,
                scale: 1 - offset * 0.05,
                opacity: offset > 3 ? 0 : 1 - offset * 0.12,
                zIndex: cards.length - offset,
                rotate: hovering && !isActive ? offset * 1.5 : 0,
              }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              className="absolute inset-x-0 top-0"
              style={{ pointerEvents: offset > 2 ? "none" : "auto" }}
              onClick={(e) => {
                if (!isActive) {
                  e.stopPropagation();
                  setActive(i);
                }
              }}
            >
              {isActive ? (
                <FlipCard
                  card={card}
                  flipped={!!flipped[card.id]}
                  onToggle={() => onToggleFlip(card.id)}
                  index={i}
                />
              ) : (
                // Lightweight non-interactive preview for back cards
                <div className="w-full aspect-[1.586/1] rounded-2xl bg-[linear-gradient(135deg,#064e3b_0%,#047857_45%,#0f766e_100%)] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)] cursor-pointer" />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Pagination dots */}
      {cards.length > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {cards.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-8 bg-primary" : "w-1.5 bg-muted-foreground/40"
              }`}
              aria-label={`Show card ${i + 1}`}
            />
          ))}
        </div>
      )}

      <div className="mt-6">{renderActions(cards[active])}</div>
    </div>
  );
};

export default CardStack;
