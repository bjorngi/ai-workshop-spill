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
  // While being dragged, shrink to a compact placed-card form (dot + label) so
  // it doesn't obscure the grid spot you're aiming for. Mirrors the anchor dots
  // in Grid.tsx, but blue. Pointer capture (useDrag) keeps drag working on the
  // same element even after it shrinks.
  if (dragging) {
    return (
      <div
        {...dragHandlers}
        className="flex cursor-grabbing select-none flex-col items-center"
        style={dragHandlers?.style}
      >
        <div className="h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900" />
        <span className="mt-0.5 max-w-[7rem] truncate rounded bg-white/80 px-1 text-[10px] font-medium text-gray-700 dark:bg-gray-800/80 dark:text-gray-200">
          {card.title}
        </span>
      </div>
    );
  }

  return (
    <div
      {...dragHandlers}
      className={[
        "select-none rounded-xl border-2 px-4 py-3 text-center shadow-lg transition",
        "border-indigo-400 bg-indigo-500 text-white",
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
