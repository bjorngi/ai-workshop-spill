// Central GSAP setup. Import this module (for its side effects) anywhere GSAP is
// used so plugins are registered exactly once and project-wide defaults/eases
// are available. Re-exports the bits components need.
//
// NOTE: this app runs in React Router SPA mode (ssr:false), but the root shell is
// still prerendered in Node at build time. Plugin registration / ease creation
// touch globals, so we guard them behind a browser check. The `gsap` object
// itself is safe to import in Node.

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Flip } from "gsap/Flip";
import { SplitText } from "gsap/SplitText";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { CustomEase } from "gsap/CustomEase";
import { Physics2DPlugin } from "gsap/Physics2DPlugin";

if (typeof window !== "undefined") {
  gsap.registerPlugin(
    useGSAP,
    Flip,
    SplitText,
    Draggable,
    InertiaPlugin,
    CustomEase,
    Physics2DPlugin,
  );

  // Project-wide named eases (cubic-bezier form is always valid).
  // "pop"   — punchy overshoot for entrances / score pops.
  // "glide" — smooth deep-out for slides and morphs.
  CustomEase.create("pop", "0.34,1.56,0.64,1");
  CustomEase.create("glide", "0.16,1,0.3,1");

  gsap.defaults({ ease: "power3.out", duration: 0.6 });
}

/** True when the user has asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export { gsap, useGSAP, Flip, SplitText, Draggable, InertiaPlugin };
