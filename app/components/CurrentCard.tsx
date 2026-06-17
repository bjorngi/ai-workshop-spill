// The draggable mystery card token. Shows ONLY the card title until reveal.
//
// Visual states share ONE persistent DOM element (the one `dragHandlers` is
// spread onto) so `useDrag`'s setPointerCapture keeps working across the morph:
//   - idle  → big solid neon card (static, high-contrast, readable)
//   - drag  → shrinks to a small glowing cyan dot so the grid target stays visible
// We never remount the handler element; we only cross-fade/scale two inner
// layers. This keeps placement math 100% intact.

import { useRef } from "react";

import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";
import { playSound } from "~/audio/useSound";
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const didEnter = useRef(false);

  // Dramatic spotlight drop-in on first mount (one-shot, no looping pulse).
  useGSAP(
    () => {
      const big = cardRef.current;
      if (!big || didEnter.current) return;
      didEnter.current = true;

      if (prefersReducedMotion()) {
        gsap.set(big, { autoAlpha: 1, y: 0, scale: 1 });
        return;
      }

      gsap.from(big, {
        autoAlpha: 0,
        y: -160,
        scale: 0.6,
        rotation: -6,
        duration: 0.7,
        ease: "back.out(2.2)",
      });
    },
    { scope: rootRef },
  );

  // Morph between big card and small dot whenever `dragging` flips. We animate
  // scale/opacity on two stacked inner layers (the handler element itself is
  // never touched, preserving pointer capture).
  useGSAP(
    () => {
      const big = cardRef.current;
      const dot = dotRef.current;
      if (!big || !dot) return;

      const reduce = prefersReducedMotion();
      const dur = reduce ? 0 : 0.28;

      if (dragging) {
        gsap.to(big, { autoAlpha: 0, scale: 0.4, duration: dur, ease: "glide" });
        gsap.to(dot, { autoAlpha: 1, scale: 1, duration: dur, ease: "pop" });
      } else {
        gsap.to(dot, { autoAlpha: 0, scale: 0.4, duration: dur, ease: "glide" });
        gsap.to(big, { autoAlpha: 1, scale: 1, duration: dur, ease: "pop" });
      }
    },
    { dependencies: [dragging], scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      {...dragHandlers}
      onPointerUp={(e) => {
        playSound("drop");
        dragHandlers?.onPointerUp?.(e);
      }}
      className="relative select-none"
      style={{
        ...dragHandlers?.style,
        cursor: placed ? "default" : dragging ? "grabbing" : "grab",
      }}
    >
      {/* Small glowing dot — visible while dragging. Centered on the cursor. */}
      <div
        ref={dotRef}
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={{ opacity: 0, visibility: "hidden" }}
      >
        <div className="h-3.5 w-3.5 rounded-full bg-neon-cyan ring-2 ring-white/80 shadow-[0_0_16px_var(--color-neon-cyan)]" />
        <span className="mt-1 max-w-[7rem] truncate rounded bg-stage-2 px-1.5 text-[10px] font-semibold tracking-wide text-neon-cyan">
          {card.title}
        </span>
      </div>

      {/* Big solid neon card — the idle / resting form. Solid + no text glow so
          the title stays crisp and readable. */}
      <div
        ref={cardRef}
        className={[
          "rounded-2xl border-2 px-6 py-4 text-center box-glow glow-purple",
          "border-neon-purple bg-stage-2 text-white shadow-xl",
          placed ? "opacity-60" : "",
        ].join(" ")}
      >
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-neon-cyan">
          Mysteriekort
        </div>
        <div className="mt-1 font-display text-2xl uppercase leading-tight tracking-wide text-white">
          {card.title}
        </div>
      </div>
    </div>
  );
}
