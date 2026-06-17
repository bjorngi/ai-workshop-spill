// Lists THEMES as selectable cards showing name + X/Y axis labels.

import { useRef } from "react";
import type { Theme } from "~/game/types";
import { THEMES } from "~/game/themes";
import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";
import { playSound } from "~/audio/useSound";

interface GamePickerProps {
  selectedId?: string | null;
  onSelect: (theme: Theme) => void;
  /** Disable selection (e.g. guest waiting for host). */
  disabled?: boolean;
}

// One neon accent per card index — border, glow halo, axis pills.
const ACCENTS = [
  { name: "pink", text: "text-neon-pink", border: "border-neon-pink", glow: "glow-pink" },
  { name: "cyan", text: "text-neon-cyan", border: "border-neon-cyan", glow: "glow-cyan" },
  { name: "lime", text: "text-neon-lime", border: "border-neon-lime", glow: "glow-lime" },
  { name: "gold", text: "text-neon-gold", border: "border-neon-gold", glow: "glow-gold" },
  { name: "purple", text: "text-neon-purple", border: "border-neon-purple", glow: "glow-purple" },
] as const;

export function GamePicker({ selectedId, onSelect, disabled }: GamePickerProps) {
  const scope = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<gsap.core.Tween | null>(null);

  // Entrance: stagger cards in. Re-runs if selection changes only matters for the
  // pulse loop below, which we drive off selectedId in its own effect.
  useGSAP(
    () => {
      const cards = gsap.utils.toArray<HTMLElement>(".picker-card");
      if (prefersReducedMotion()) {
        gsap.set(cards, { autoAlpha: 1, y: 0, scale: 1 });
        return;
      }
      gsap.from(cards, {
        autoAlpha: 0,
        y: 28,
        scale: 0.92,
        duration: 0.55,
        ease: "pop",
        stagger: 0.07,
      });
    },
    { scope },
  );

  // Selected card: pop + subtle pulsing glow loop. Kill the previous loop first.
  useGSAP(
    () => {
      pulseRef.current?.kill();
      pulseRef.current = null;
      if (!selectedId) return;
      const el = scope.current?.querySelector<HTMLElement>(
        `[data-theme-id="${selectedId}"]`,
      );
      if (!el) return;
      if (prefersReducedMotion()) return;

      gsap.fromTo(
        el,
        { scale: 1 },
        { scale: 1.05, duration: 0.32, ease: "pop", yoyo: true, repeat: 1 },
      );
      pulseRef.current = gsap.to(el, {
        filter: "brightness(1.18)",
        duration: 0.9,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    },
    { scope, dependencies: [selectedId] },
  );

  return (
    <div ref={scope} className="grid w-full gap-4 sm:grid-cols-2">
      {THEMES.map((theme, i) => {
        const accent = ACCENTS[i % ACCENTS.length];
        const selected = theme.id === selectedId;
        return (
          <ThemeCard
            key={theme.id}
            theme={theme}
            accent={accent}
            selected={selected}
            disabled={disabled}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

interface ThemeCardProps {
  theme: Theme;
  accent: (typeof ACCENTS)[number];
  selected: boolean;
  disabled?: boolean;
  onSelect: (theme: Theme) => void;
}

function ThemeCard({ theme, accent, selected, disabled, onSelect }: ThemeCardProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const { contextSafe } = useGSAP({ scope: ref });

  const handleEnter = contextSafe(() => {
    if (disabled || prefersReducedMotion()) return;
    gsap.to(ref.current, {
      scale: 1.04,
      rotate: -1.5,
      duration: 0.3,
      ease: "pop",
    });
  });

  const handleLeave = contextSafe(() => {
    if (prefersReducedMotion()) return;
    // Don't fight the selected pulse: only revert transform, leave filter alone.
    gsap.to(ref.current, {
      scale: selected ? 1.0 : 1,
      rotate: 0,
      duration: 0.35,
      ease: "glide",
    });
  });

  const handleClick = () => {
    playSound("click");
    onSelect(theme);
  };

  return (
    <button
      ref={ref}
      type="button"
      data-theme-id={theme.id}
      disabled={disabled}
      onClick={handleClick}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      className={[
        "picker-card anim-init group relative overflow-hidden rounded-2xl border-2 p-5 text-left",
        "bg-stage-2/70 backdrop-blur transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? `${accent.border} box-glow ${accent.glow}`
          : "border-white/10 hover:border-white/30",
      ].join(" ")}
    >
      <div
        className={[
          "font-display text-2xl uppercase tracking-wide",
          selected ? `${accent.text} text-glow` : "text-white",
        ].join(" ")}
      >
        {theme.name}
      </div>
      {theme.description && (
        <div className="mt-1.5 text-sm text-gray-300/90">{theme.description}</div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <span
          className={[
            "rounded-full border px-2.5 py-1 uppercase tracking-wide",
            "border-current/40 bg-white/5",
            accent.text,
            "text-glow",
          ].join(" ")}
        >
          X: {theme.xAxis.label}
        </span>
        <span
          className={[
            "rounded-full border px-2.5 py-1 uppercase tracking-wide",
            "border-current/40 bg-white/5",
            accent.text,
            "text-glow",
          ].join(" ")}
        >
          Y: {theme.yAxis.label}
        </span>
      </div>
    </button>
  );
}
