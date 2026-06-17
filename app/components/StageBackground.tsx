import { useRef } from "react";

import { gsap, useGSAP } from "~/anim/gsap";

// A fixed, full-viewport neon "stage" that sits behind everything:
//  - a slowly drifting multi-stop gradient wash (animated hue),
//  - two big spotlight cones sweeping across the stage,
//  - a scatter of floating bokeh dots.
// All motion is wrapped in gsap.matchMedia so it goes static under
// prefers-reduced-motion.

const BOKEH = Array.from({ length: 18 });

export function StageBackground() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Drifting hue on the gradient wash.
        gsap.to(root.current, {
          "--stage-hue": 80,
          duration: 18,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });

        // Spotlight cones sweep + rotate on their own loops.
        gsap.to(".stage-spot-a", {
          xPercent: 40,
          rotation: 18,
          duration: 9,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          transformOrigin: "50% 0%",
        });
        gsap.to(".stage-spot-b", {
          xPercent: -35,
          rotation: -22,
          duration: 11,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          transformOrigin: "50% 0%",
        });

        // Bokeh drift — randomized per dot.
        gsap.to(".stage-bokeh", {
          y: () => gsap.utils.random(-80, 80),
          x: () => gsap.utils.random(-60, 60),
          scale: () => gsap.utils.random(0.6, 1.5),
          opacity: () => gsap.utils.random(0.1, 0.5),
          duration: () => gsap.utils.random(6, 14),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          stagger: { each: 0.3, from: "random" },
        });

        gsap.set(".stage-bokeh", { opacity: 0.18 });
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ ["--stage-hue" as string]: 0 }}
    >
      {/* base gradient wash, hue shifted by --stage-hue */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 20% 0%, hsl(calc(285 + var(--stage-hue)) 80% 14%) 0%, transparent 55%)," +
            "radial-gradient(120% 90% at 85% 10%, hsl(calc(190 + var(--stage-hue)) 85% 14%) 0%, transparent 50%)," +
            "radial-gradient(140% 120% at 50% 110%, hsl(calc(320 + var(--stage-hue)) 80% 12%) 0%, transparent 60%)",
        }}
      />

      {/* spotlight cones */}
      <div
        className="stage-spot-a absolute -top-1/3 left-1/4 h-[160%] w-1/2 opacity-[0.16] blur-2xl"
        style={{
          background:
            "conic-gradient(from 180deg at 50% 0%, transparent 78deg, var(--color-neon-cyan) 90deg, transparent 102deg)",
        }}
      />
      <div
        className="stage-spot-b absolute -top-1/3 right-1/4 h-[160%] w-1/2 opacity-[0.13] blur-2xl"
        style={{
          background:
            "conic-gradient(from 180deg at 50% 0%, transparent 78deg, var(--color-neon-pink) 90deg, transparent 102deg)",
        }}
      />

      {/* floating bokeh */}
      {BOKEH.map((_, i) => (
        <span
          key={i}
          className="stage-bokeh absolute rounded-full blur-[2px]"
          style={{
            top: `${(i * 53) % 100}%`,
            left: `${(i * 37) % 100}%`,
            width: 6 + (i % 5) * 5,
            height: 6 + (i % 5) * 5,
            background:
              i % 3 === 0
                ? "var(--color-neon-cyan)"
                : i % 3 === 1
                  ? "var(--color-neon-pink)"
                  : "var(--color-neon-gold)",
            opacity: 0.25,
          }}
        />
      ))}

      {/* subtle vignette to anchor content */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_40%,transparent_55%,rgba(0,0,0,0.6)_100%)]" />
    </div>
  );
}
