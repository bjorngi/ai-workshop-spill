import { useRef } from "react";

import { gsap, useGSAP, prefersReducedMotion } from "~/anim/gsap";
import { bumpVolume } from "./sound";
import { useVolume } from "./useSound";

// A deliberately oversized "mute" button that is a gag: it never mutes — every
// press cranks the master volume UP a little (capped) with a chunky bounce and
// a rising "louder!" sound. The icon gains extra waves as it gets louder.

export function VolumeButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const { volume, cap } = useVolume();

  const { contextSafe } = useGSAP({ scope: ref });

  const pct = Math.min(1, volume / cap);
  // 0..3 sound waves depending on how loud we are.
  const waves = Math.min(3, Math.round(pct * 3));

  const onClick = contextSafe(() => {
    bumpVolume();
    if (prefersReducedMotion()) return;
    gsap
      .timeline()
      .to(ref.current, { scale: 1.25, duration: 0.12, ease: "pop" })
      .to(ref.current, { scale: 1, duration: 0.45, ease: "elastic.out(1, 0.4)" })
      .fromTo(
        ref.current,
        { rotation: -8 },
        { rotation: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" },
        0,
      );
  });

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label="Skru opp lyden (knappen demper aldri)"
      title="MER LYD"
      className="box-glow glow-pink grid h-16 w-16 place-items-center rounded-2xl border-2 border-neon-pink/70 bg-stage-2/80 text-neon-pink backdrop-blur transition-colors hover:bg-neon-pink/15"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8 text-glow"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* speaker body */}
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
        {/* sound waves grow with volume */}
        {waves >= 1 && <path d="M16 9.5a4 4 0 0 1 0 5" />}
        {waves >= 2 && <path d="M18.5 7a8 8 0 0 1 0 10" />}
        {waves >= 3 && <path d="M21 4.5a12 12 0 0 1 0 15" />}
      </svg>
    </button>
  );
}
