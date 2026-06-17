// The 2D plot for a theme. Anchors render as labeled dots; the player's current
// placement renders as a draggable marker. At reveal we show the card's true
// position and (multiplayer) the opponent's marker.

import { useRef } from "react";

import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";
import { playSound } from "~/audio/useSound";
import type { Card, Placement, Theme } from "~/game/types";
import { axisDomain, axisTicks, valueToFraction } from "~/game/scoring";
import { formatNumber } from "~/game/format";
import { useDrag } from "~/components/useDrag";
import { CurrentCard } from "~/components/CurrentCard";

interface GridProps {
  theme: Theme;
  /** Reference anchors already on the board (with known values). */
  anchors: Card[];
  /** The mystery card being placed this round. */
  current: Card | null;
  /** Player's current placement (bottom-left fractions). */
  placement: Placement | null;
  /** Called when the player drops the token while dragging is enabled. */
  onPlace?: (placement: Placement) => void;
  /** Disable dragging (after lock-in / at reveal). */
  locked?: boolean;
  /** Reveal mode: show the current card's true position. */
  revealed?: boolean;
  /** Other players' placements to show at reveal (multiplayer, N players). */
  others?: { pid: string; name: string; placement: Placement }[];
  myName?: string;
}

/** Marker palette for other players (self = blue, fasit = pink, anchors = lime). */
const OTHER_COLORS = [
  {
    dot: "bg-neon-gold",
    label: "bg-neon-gold text-stage",
    glow: "glow-gold",
    shadow: "shadow-[0_0_16px_var(--color-neon-gold)]",
  },
  {
    dot: "bg-neon-purple",
    label: "bg-neon-purple text-white",
    glow: "glow-purple",
    shadow: "shadow-[0_0_16px_var(--color-neon-purple)]",
  },
  {
    dot: "bg-neon-cyan",
    label: "bg-neon-cyan text-stage",
    glow: "glow-cyan",
    shadow: "shadow-[0_0_16px_var(--color-neon-cyan)]",
  },
];

/** Position helper: convert bottom-left fractions to CSS left/bottom %. */
function pct(f: number): string {
  return `${f * 100}%`;
}

export function Grid({
  theme,
  anchors,
  current,
  placement,
  onPlace,
  locked,
  revealed,
  others,
  myName,
}: GridProps) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const seenAnchors = useRef(0);

  const { dragging, position, dragHandlers } = useDrag(plotRef, (p) => {
    if (!locked) onPlace?.(p);
  });

  const xDomain = axisDomain(theme, "x");
  const yDomain = axisDomain(theme, "y");

  // Nice tick VALUES within each domain, plus their fractional positions.
  const xTicks = axisTicks(xDomain.min, xDomain.max, theme.xAxis.scale).map(
    (value) => ({
      value,
      f: valueToFraction(value, xDomain.min, xDomain.max, theme.xAxis.scale),
    }),
  );
  const yTicks = axisTicks(yDomain.min, yDomain.max, theme.yAxis.scale).map(
    (value) => ({
      value,
      f: valueToFraction(value, yDomain.min, yDomain.max, theme.yAxis.scale),
    }),
  );

  // While dragging, show the live position; otherwise the committed placement.
  const livePlacement = dragging && position ? position : placement;

  const trueFx = current
    ? valueToFraction(current.x, xDomain.min, xDomain.max, theme.xAxis.scale)
    : 0;
  const trueFy = current
    ? valueToFraction(current.y, yDomain.min, yDomain.max, theme.yAxis.scale)
    : 0;

  // ---- Entrance: frame in, gridlines draw, ticks + anchors stagger in ------
  useGSAP(
    () => {
      const reduce = prefersReducedMotion();

      if (reduce) {
        gsap.set(
          [
            ".grid-frame",
            ".grid-line",
            ".grid-tick",
            ".grid-axis-label",
            ".anchor-dot",
          ],
          { autoAlpha: 1, clearProps: "transform" },
        );
        seenAnchors.current = anchors.length;
        return;
      }

      const tl = gsap.timeline();

      tl.from(".grid-frame", {
        autoAlpha: 0,
        scale: 0.9,
        duration: 0.6,
        ease: "pop",
      });

      // Horizontal gridlines draw from the left, verticals from the bottom.
      tl.from(
        ".grid-line-h",
        {
          autoAlpha: 0,
          scaleX: 0,
          transformOrigin: "left center",
          duration: 0.5,
          ease: "glide",
          stagger: 0.05,
        },
        "-=0.25",
      );
      tl.from(
        ".grid-line-v",
        {
          autoAlpha: 0,
          scaleY: 0,
          transformOrigin: "center bottom",
          duration: 0.5,
          ease: "glide",
          stagger: 0.05,
        },
        "<",
      );

      tl.from(
        ".grid-tick",
        { autoAlpha: 0, duration: 0.4, stagger: 0.02 },
        "-=0.3",
      );
      tl.from(
        ".grid-axis-label",
        { autoAlpha: 0, y: 6, duration: 0.4 },
        "<",
      );

      // Anchors pop in with a stagger.
      tl.from(
        ".anchor-dot",
        {
          autoAlpha: 0,
          scale: 0,
          transformOrigin: "center center",
          duration: 0.5,
          ease: "pop",
          stagger: 0.06,
        },
        "-=0.2",
      );

      seenAnchors.current = anchors.length;
    },
    { scope: rootRef },
  );

  // ---- New anchor appended: pop ONLY the newest dot ------------------------
  useGSAP(
    () => {
      if (anchors.length <= seenAnchors.current) {
        seenAnchors.current = anchors.length;
        return;
      }
      const dots = rootRef.current?.querySelectorAll(".anchor-dot");
      const newest = dots?.[dots.length - 1];
      seenAnchors.current = anchors.length;
      if (!newest) return;

      if (prefersReducedMotion()) {
        gsap.set(newest, { autoAlpha: 1 });
        return;
      }
      gsap.from(newest, {
        autoAlpha: 0,
        scale: 0,
        transformOrigin: "center center",
        duration: 0.5,
        ease: "pop",
      });
    },
    { dependencies: [anchors.length], scope: rootRef },
  );

  // ---- Reveal: true marker bursts + shockwave + infinite pulse ------------
  useGSAP(
    () => {
      if (!revealed || !current) return;
      const reduce = prefersReducedMotion();

      const truth = rootRef.current?.querySelector(".truth-marker");
      const dot = rootRef.current?.querySelector(".truth-dot");
      const wave = rootRef.current?.querySelector(".truth-wave");
      const me = rootRef.current?.querySelector(".me-marker");
      const opps = rootRef.current?.querySelectorAll(".opp-marker");
      const oppList = opps ? Array.from(opps) : [];

      playSound("reveal");

      if (reduce) {
        gsap.set([truth, me, ...oppList].filter(Boolean), { autoAlpha: 1 });
        if (wave) gsap.set(wave, { autoAlpha: 0 });
        return;
      }

      const tl = gsap.timeline();
      if (truth) {
        tl.from(truth, {
          autoAlpha: 0,
          scale: 0,
          duration: 0.6,
          ease: "pop",
        });
      }
      // Expanding shockwave ring.
      if (wave) {
        tl.fromTo(
          wave,
          { autoAlpha: 0.9, scale: 0.3 },
          { autoAlpha: 0, scale: 3.2, duration: 0.9, ease: "glide" },
          0,
        );
      }
      // Other players' + my markers pop in.
      if (oppList.length) {
        tl.from(
          oppList,
          { autoAlpha: 0, scale: 0, duration: 0.5, ease: "pop", stagger: 0.06 },
          "-=0.4",
        );
      }
      if (me) {
        tl.from(
          me,
          { autoAlpha: 0, scale: 0, duration: 0.5, ease: "pop" },
          "<",
        );
      }

      // Balloon: the guess dot inflates toward the true answer — visualising the
      // distance — then implodes back to its real size.
      const meDot = rootRef.current?.querySelector(".me-dot");
      if (meDot && placement) {
        const W = plotRef.current?.clientWidth ?? 0;
        const H = plotRef.current?.clientHeight ?? 0;
        const dx = (trueFx - placement.fx) * W;
        const dy = -(trueFy - placement.fy) * H; // screen Y is inverted vs fy
        const dist = Math.hypot(dx, dy);
        const DOT = 20; // px, matches h-5 w-5
        const maxScale = Math.max(1, Math.min(W, H) / DOT);
        const targetScale = Math.min(maxScale, Math.max(1.2, dist / DOT));
        tl.to(
          meDot,
          {
            x: dx / 2,
            y: dy / 2,
            scale: targetScale,
            autoAlpha: 0.65,
            duration: 1,
            ease: "sine.inOut",
          },
          ">-0.05",
        ).to(meDot, {
          x: 0,
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: 0.45,
          ease: "back.in(2)",
        });
      }

      // Infinite glow/scale pulse on the true dot (replaces animate-pulse).
      if (dot) {
        tl.to(
          dot,
          {
            scale: 1.3,
            filter: "brightness(1.5)",
            duration: 0.7,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
          },
          ">-0.1",
        );
      }
    },
    { dependencies: [revealed, current?.id], scope: rootRef },
  );

  return (
    <div ref={rootRef} className="flex items-center gap-2">
      {/* Y axis label: vertical, reading bottom-to-top, centered on the plot. */}
      <span className="grid-axis-label text-sm font-display uppercase tracking-wide text-neon-cyan text-glow [writing-mode:vertical-rl] rotate-180">
        {theme.yAxis.label}
        {theme.yAxis.unit ? ` (${theme.yAxis.unit})` : ""}
        {theme.yAxis.scale === "log" ? " · log" : ""}
      </span>

      {/* Plot column: [y-ticks | plot] row, then x-ticks, then x label. */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-stretch gap-1">
          {/* Y tick labels, vertically centered on each gridline. */}
          <div className="relative w-12 min-w-[2.5rem]">
            {yTicks.map(({ value, f }) => (
              <span
                key={`yt${value}`}
                className="grid-tick absolute right-0 -translate-y-1/2 pr-1 text-[10px] tabular-nums text-neon-cyan/70"
                style={{ bottom: pct(f) }}
              >
                {formatNumber(value)}
              </span>
            ))}
          </div>

          {/* The plot itself */}
          <div
            ref={plotRef}
            className="grid-frame relative rounded-2xl border-2 border-neon-purple bg-stage-2/60 backdrop-blur box-glow glow-purple"
            style={{
              width: "min(80vw, 560px)",
              height: "min(80vw, 560px)",
            }}
          >
            {/* Subtle grid lines aligned to tick values. Skip the edges (0/1)
                since the plot border already draws them. */}
            {yTicks.map(({ value, f }) =>
              f <= 0 || f >= 1 ? null : (
                <div
                  key={`h${value}`}
                  className="grid-line grid-line-h absolute left-0 right-0 border-t border-dashed border-neon-cyan/15"
                  style={{ bottom: pct(f) }}
                />
              ),
            )}
            {xTicks.map(({ value, f }) =>
              f <= 0 || f >= 1 ? null : (
                <div
                  key={`v${value}`}
                  className="grid-line grid-line-v absolute bottom-0 top-0 border-l border-dashed border-neon-cyan/15"
                  style={{ left: pct(f) }}
                />
              ),
            )}

            {/* Anchor dots */}
            {anchors.map((a) => {
              const fx = valueToFraction(
                a.x,
                xDomain.min,
                xDomain.max,
                theme.xAxis.scale,
              );
              const fy = valueToFraction(
                a.y,
                yDomain.min,
                yDomain.max,
                theme.yAxis.scale,
              );
              return (
                <div
                  key={a.id}
                  className="anchor-dot absolute flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
                  style={{ left: pct(fx), bottom: pct(fy) }}
                >
                  <div className="h-3 w-3 rounded-full bg-neon-lime box-glow glow-lime ring-2 ring-white/70 shadow-[0_0_12px_var(--color-neon-lime)]" />
                  <span className="mt-0.5 max-w-[7rem] truncate rounded bg-stage-2/80 px-1 text-[10px] font-medium text-neon-lime backdrop-blur">
                    {a.title}
                  </span>
                </div>
              );
            })}

            {/* Other players' markers (reveal, multiplayer, N players) */}
            {revealed &&
              others?.map((o, i) => {
                const c = OTHER_COLORS[i % OTHER_COLORS.length];
                return (
                  <div
                    key={o.pid}
                    className="opp-marker absolute flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
                    style={{
                      left: pct(o.placement.fx),
                      bottom: pct(o.placement.fy),
                    }}
                  >
                    <div
                      className={`h-5 w-5 rounded-full border-2 border-white box-glow ${c.dot} ${c.glow} ${c.shadow}`}
                    />
                    <span
                      className={`mt-0.5 rounded px-1 text-[10px] font-bold ${c.label}`}
                    >
                      {o.name}
                    </span>
                  </div>
                );
              })}

            {/* True position (reveal) */}
            {revealed && current && (
              <div
                className="truth-marker absolute z-10 flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
                style={{ left: pct(trueFx), bottom: pct(trueFy) }}
              >
                {/* Expanding shockwave ring */}
                <div
                  className="truth-wave pointer-events-none absolute h-6 w-6 rounded-full border-2 border-neon-pink"
                  style={{ opacity: 0, left: 0, top: 0 }}
                />
                <div className="truth-dot h-6 w-6 rounded-full border-2 border-white bg-neon-pink box-glow glow-pink shadow-[0_0_24px_var(--color-neon-pink)]" />
                <span className="mt-0.5 rounded bg-neon-pink px-1 text-[10px] font-bold text-white text-glow">
                  {current.title} (fasit)
                </span>
              </div>
            )}

            {/* Player's draggable marker */}
            {current && !revealed && (
              <div
                className="absolute z-20 -translate-x-1/2 translate-y-1/2"
                style={{
                  left: livePlacement ? pct(livePlacement.fx) : "50%",
                  bottom: livePlacement ? pct(livePlacement.fy) : "50%",
                }}
              >
                <CurrentCard
                  card={current}
                  dragHandlers={dragHandlers}
                  dragging={dragging}
                  placed={locked}
                />
              </div>
            )}

            {/* Player's committed marker at reveal */}
            {revealed && placement && (
              <div
                className="me-marker absolute z-10 flex -translate-x-1/2 translate-y-1/2 flex-col items-center"
                style={{ left: pct(placement.fx), bottom: pct(placement.fy) }}
              >
                <div className="me-dot h-5 w-5 rounded-full border-2 border-white bg-neon-blue box-glow glow-blue shadow-[0_0_16px_var(--color-neon-blue)]" />
                <span className="mt-0.5 rounded bg-neon-blue px-1 text-[10px] font-bold text-white">
                  {myName ?? "Du"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* X tick labels, horizontally centered on each gridline. Same width
            as the plot so fractions line up. */}
        <div className="relative h-5" style={{ width: "min(80vw, 560px)" }}>
          {xTicks.map(({ value, f }) => (
            <span
              key={`xt${value}`}
              className="grid-tick absolute top-0 -translate-x-1/2 text-[10px] tabular-nums text-neon-cyan/70"
              style={{ left: pct(f) }}
            >
              {formatNumber(value)}
            </span>
          ))}
        </div>

        {/* X axis label, centered below the ticks. */}
        <span className="grid-axis-label text-sm font-display uppercase tracking-wide text-neon-cyan text-glow">
          {theme.xAxis.label}
          {theme.xAxis.unit ? ` (${theme.xAxis.unit})` : ""}
          {theme.xAxis.scale === "log" ? " · log" : ""}
        </span>
      </div>
    </div>
  );
}
