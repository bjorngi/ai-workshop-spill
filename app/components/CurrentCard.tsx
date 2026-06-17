// The draggable mystery card token. Shows ONLY the card title until reveal.

import type { Card } from "~/game/types";

interface CurrentCardProps {
  card: Card;
  /** Drag handlers from useDrag, spread onto the token. */
  dragHandlers?: React.HTMLAttributes<HTMLDivElement> & {
    style?: React.CSSProperties;
  };
  /** Whether the card is currently being dragged. */
  dragging?: boolean;
  /** Whether the card has already been placed (locked-in or revealed). */
  placed?: boolean;
}

export function CurrentCard({
  card,
  dragHandlers,
  dragging,
  placed,
}: CurrentCardProps) {
  return (
    <div
      {...dragHandlers}
      className={[
        "select-none rounded-xl border-2 px-4 py-3 text-center shadow-lg transition",
        "border-indigo-400 bg-indigo-500 text-white",
        dragging ? "scale-105 cursor-grabbing shadow-2xl ring-4 ring-indigo-300" : "",
        placed ? "opacity-60" : "cursor-grab hover:scale-105",
      ].join(" ")}
      style={dragHandlers?.style}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-indigo-100">
        Mysteriekort
      </div>
      <div className="text-lg font-bold leading-tight">{card.title}</div>
    </div>
  );
}
