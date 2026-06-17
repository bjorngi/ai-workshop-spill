# Beslutningslogg / Decision Log

A running log of non-obvious choices made while building the game. Newest at the bottom.
Format: `## YYYY-MM-DD — <decision>` followed by a short rationale.

## 2026-06-17 — Game concept

2-player Hitster-inspired placement game with a Norwegian theme. Cards are placed on a **2D
grid with two arbitrary numeric axes**. Mechanic = Hitster-style **relative ordering**: place
the mystery card correctly relative to the cards already on the board.

## 2026-06-17 — Axes are generic per game

The Y axis is **not** hard-wired to time. Each "game" (theme) defines its own X and Y axis
(any numeric metric). Examples: OL-utøvere (X = antall OL-gull, Y = høyde cm); filmer
(X = utgivelsesår, Y = IMDB-score). The engine is symmetric over both axes; adding a new game
is just adding one `Theme` data object. _Why:_ user wants reusable, swappable themes.

## 2026-06-17 — Multiplayer over WebRTC P2P, manual copy-paste signaling

2 players, both running the dev app, connect peer-to-peer via a single `RTCDataChannel`.
Signaling is **manual copy-paste** of base64-encoded SDP offer/answer codes — zero
infrastructure, no signaling server. Uses non-trickle ICE (wait for gathering to complete) so
each code is a single self-contained blob. STUN: `stun:stun.l.google.com:19302`.
_Why:_ user wants true P2P with no backend.

## 2026-06-17 — Match flow: same card, head-to-head; closer wins

Both players get the same card each round and place simultaneously. Whoever is **closer** to
correct (lower summed slot error across both axes) wins the point; tie = no point.

## 2026-06-17 — Scoring: relative-ordering slot distance

For the card's true (x, y): true slot on an axis = number of anchors with a smaller value.
Player's slot = number of anchors "below" their drop point on that axis. Error =
|playerSlot − trueSlot| per axis; total = xError + yError. _Why:_ Hitster-style, forgiving,
no need to know exact values.

## 2026-06-17 — Board uses seed anchors + grows each round

Each game starts with a few seed anchor cards (shown, not scored) so round 1 has reference
points on both axes. Each revealed mystery card joins the board as a new anchor, so the board
grows denser and harder over the match (Hitster escalation). Board is identical on both peers
(same theme + seeded shuffle + revealed truth).

## 2026-06-17 — SPA mode (ssr: false)

The game is entirely client-side. Switched React Router to SPA mode to avoid SSR/hydration
issues with browser-only APIs (RTCPeerConnection, pointer events).

## 2026-06-17 — Placement via pointer-based drag and drop

The mystery card is a draggable token; players drag it onto the grid and drop it. Implemented
with raw pointer events (pointerdown/move/up) for mouse + touch support, no DnD library.

## 2026-06-17 — Placement encoded as normalized fractions

`Placement` is sent over the wire as `{ fx, fy }` fractions in [0,1] of the plot area
(origin bottom-left). Slots are derived from these + the shared anchor set, so scoring is
deterministic across peers regardless of each window's pixel size.

## 2026-06-17 — Docker: static nginx image, not a Node server

Because the app is SPA mode (ssr:false), `npm run build` emits a static client bundle in
`build/client` and there is no server to run (`npm run start` no longer applies). The Dockerfile
is a two-stage build: node:20-alpine builds the assets, then nginx:1.27-alpine serves
`build/client` on port 8080 with an SPA fallback (`try_files ... /index.html`) so client-side
routing survives deep links/refresh. See `nginx.conf`.

## 2026-06-17 — CI: build + push image to GHCR on every push to main

`.github/workflows/docker-publish.yml` builds the Docker image and pushes it to
`ghcr.io/<owner>/<repo>` on every push to `main` (plus manual `workflow_dispatch`). Auth uses
the built-in `GITHUB_TOKEN` with `packages: write`; tags are the long commit SHA and `latest`.
Uses GitHub Actions cache (`type=gha`) to speed up rebuilds. _Note:_ the package is created
private by default — make it public in the repo's Packages settings if anonymous pulls are needed.

## 2026-06-17 — Singleplayer mode

Besides 2-player WebRTC, the game must be playable solo. Solo mode skips all networking
(setup → pick game → play): you place each mystery card against the hidden true position and
accumulate a score based on how close you were (slot error per round). Same board/anchor
mechanics as multiplayer, just no opponent and no `PeerLink`.

## 2026-06-17 — No automated tests

Per user direction, we skip a test framework entirely ("rawdog it"). Correctness is checked
via `npm run typecheck` and manual two-window play-testing. Game-core functions are still kept
pure so they can be tested later if desired.

## 2026-06-17 — "Testdata" theme for manual testing

Added a minimal theme `id: "test"` ("Testdata") as the first entry in `THEMES`. Five cards A–E
with trivially predictable values (x=y=1..5), seed anchors A/C/E. _Why:_ gives a tiny,
easy-to-reason-about board for manually verifying placement, scoring, and drag behavior without
the noise of the real themes' values.

## 2026-06-17 — Dragged mystery card shrinks to a placed-card dot

While being dragged, the mystery card (`CurrentCard`) no longer shows the big indigo token —
it morphs into the compact placed-card form (a small dot + truncated title label), mirroring the
anchor dots in `Grid.tsx`, but **blue** (`bg-blue-500`). _Why:_ the big card body sat under the
cursor/finger and obscured the exact grid spot you were aiming for; the small dot makes placement
precise. Idle (not dragging) it stays the normal big card. Safe because `useDrag` calls
`setPointerCapture`, so the same element keeps receiving move/up events after it shrinks.

## 2026-06-17 — ConnectionPanel neon/karaoke redesign

`ConnectionPanel.tsx` restyled into the glassy neon-nightclub look: `bg-stage-2/70` glass card
with a purple neon border + `box-glow`, `font-display` headings/buttons, neon-bordered dark
textareas, and glowing neon outline buttons (pink/lime/cyan). Animation is GSAP via `useGSAP`:
the panel slides+scales in on mount (`anim-init` + `autoAlpha`), and a `state`-keyed effect
fades/slides each `.conn-step` in and pulses the status pill on every connection-state change.
Reaching `connected` fires a success flourish (card+pill scale burst + brightness pop) and
`playSound("reveal")`. All button handlers also `playSound("click")`. _Why:_ match the global
neon theme. Logic, props, and the createOffer/acceptOffer/acceptAnswer/clipboard/onBack wiring
are 100% unchanged — presentation + animation only. Reduced motion ends with everything visible.

## 2026-06-17 — Grid + CurrentCard neon/karaoke redesign (GSAP)

`Grid.tsx` and `CurrentCard.tsx` restyled into the glassy neon-nightclub look. The plot frame is
a `bg-stage-2/60 backdrop-blur` glass panel with a neon-purple border + `box-glow`. Entrance is a
single `useGSAP` timeline: frame pops in, dashed gridlines "draw" (horizontals scaleX from
`left`, verticals scaleY from `bottom`, staggered), ticks/axis labels fade in, then anchors pop
with stagger (ease "pop"). Anchor dots switched emerald→`neon-lime` with a soft halo. A second
`useGSAP` keyed on `anchors.length` pops ONLY the newest dot when the array grows (tracked via a
`seenAnchors` ref so the entrance and append hooks don't double-pop on mount). Reveal (keyed on
`revealed`/`current.id`): the `neon-pink` "fasit" marker bursts in (ease "pop") with an expanding
shockwave ring (absolute sibling scaling ~3.2x while fading), the old CSS `animate-pulse` is
replaced by an infinite GSAP scale+brightness yoyo, and player (`neon-blue`) + opponent
(`neon-gold`) markers pop in; fires `playSound("reveal")`. All axis math, tick logic, props, and
`useDrag` wiring are untouched.

`CurrentCard.tsx`: idle = glassy `neon-purple` card (`box-glow`, `font-display` title) with an
infinite "breathing" timeline (y bob + brightness pulse) wrapped in `matchMedia`; entrance is a
spotlight drop-in from above with `back.out` bounce. The morph to/from the small `neon-cyan`
glowing dot is done by cross-fading/scaling two stacked INNER layers (big card + dot) on the
SAME persistent handler element — never remounting it — so `useDrag`'s `setPointerCapture` and
all pointer/placement math stay intact (chose this over Flip to guarantee pointer capture
survives). Plays `playSound("drop")` on pointer-up. Reduced motion: all entrances/loops are
guarded and elements end up visible and usable.

## 2026-06-17 — Adopt GSAP + @gsap/react for all animation

Added `gsap` and `@gsap/react`. Plugin registration, project defaults, and named custom eases
live in one module `app/anim/gsap.ts` (registers `useGSAP, Flip, SplitText, Draggable,
InertiaPlugin, CustomEase, Physics2DPlugin`; defines eases `"pop"` overshoot and `"glide"`
smooth-out; `gsap.defaults({ ease: "power3.out", duration: 0.6 })`). Registration/ease creation
are guarded behind `typeof window !== "undefined"` because the SPA root shell is still prerendered
in Node at build time. Imported once for side effects from `app/root.tsx`. Components use the
`useGSAP(() => …, { scope: ref })` hook (auto-cleanup) and a shared `prefersReducedMotion()`
helper / `gsap.matchMedia()` so every animation has a reduced-motion branch. _Why:_ the redesign
is animation-heavy and GSAP gives timelines, SplitText, Flip and physics in one toolkit.

## 2026-06-17 — Neon "karaoke stage" visual direction

Replaced the light utility UI with a dark neon-nightclub look. Design tokens live in `app.css`
as Tailwind v4 `@theme` vars: a near-black stage (`--color-stage`, `--color-stage-2`) plus a
softened neon palette (`neon-pink/cyan/lime/gold/purple/blue`) and an **Anton** display font
(`--font-display`) for big uppercase headings, alongside Inter for body. Reusable glow helpers:
`.text-glow`/`.text-glow-strong` (currentColor) and `.box-glow` + `.glow-*` (halo via a `--glow`
var). The app is now always dark (`dark:` variants dropped). A global `StageBackground.tsx`
(mounted in `root.tsx`) renders an animated hue-drifting gradient, two sweeping spotlight cones,
and floating bokeh — all GSAP loops wrapped in `matchMedia` with a static reduced-motion fallback.
_Note:_ initial neon was too aggressive, so glow radii/opacity, palette saturation, spotlight
opacity, and the logo shimmer were all toned down centrally via the shared utilities.

## 2026-06-17 — Synthesized Web Audio SFX + gag "volume" button

`app/audio/sound.ts` is a tiny Web Audio engine (lazy `AudioContext` on first gesture) that
synthesizes all one-shots (`click, drop, lockIn, reveal, win, lose, roundStart, louder`) from
oscillator+gain envelopes — no asset files. Everything routes through one master gain whose value
is a `localStorage`-persisted **volume**, capped at a safe ceiling. There is intentionally **no
mute**: the big on-screen speaker button (`VolumeButton.tsx`, in the header) is a gag that only
ever turns the volume UP a notch per press (with a rising "louder!" sound and a bounce), and the
speaker icon grows extra waves as it gets louder. _Why:_ user asked for the mute button to make
sound louder instead of muting, and to be bigger.

## 2026-06-17 — Home screen choreography (logo, setup, game over)

`home.tsx`: the logo is `SplitText`-split and bounces in on load; its marquee shimmer now fires
**only on hover** (per user request) rather than looping. Setup screen entrance staggers in with
neon mode buttons that wiggle on hover and `playSound("click")`. Game over is its own `GameOver`
component: a bouncy `SplitText` headline, scores, and — on a win — a `Physics2D` confetti burst
from a temporary DOM layer. Sound stings: `roundStart` on entering a play round, `win`/`lose` on
game over. All guarded for reduced motion.

## 2026-06-17 — Theme description shown over the grid during play

`home.tsx` now renders `theme.description` as a centered, readable line between the `Scoreboard`
and the `Grid` on the play/reveal screen (it was previously only visible in `GamePicker`). _Why:_
user wanted the description (e.g. "Plasser utøveren etter antall OL-gull og høyde") visible while
placing, so the rules of the current game are readable at a glance.

## 2026-06-17 — gsap.matchMedia() cleanup must live in the OUTER useGSAP return

Bug fix: clicking "Lås inn" crashed with `RangeError: Maximum call stack size exceeded`
(`_parseTransform`) at reveal. Cause: `RoundResult` returned `() => mm.revert()` from INSIDE the
`mm.add(...)` callback. That makes `mm.revert()` invoke its own query-cleanup, which calls
`mm.revert()` again → infinite recursion. React StrictMode's mount→cleanup→remount in dev fired it
immediately. _Rule:_ when using `gsap.matchMedia()` inside `useGSAP`, revert it from the **outer**
useGSAP cleanup (`return () => mm.revert()` at the end of the hook callback), never as the value
returned by an `mm.add()` callback. (StageBackground and the logo already followed this.)

## 2026-06-17 — Emoji confetti on every round reveal, scaled by accuracy

Added `canvas-confetti` (+ `@types/canvas-confetti`). `app/anim/confetti.ts` exports
`celebrateResult(quality)` which fires emoji-shaped confetti (`confetti.shapeFromText`) from the
two lower corners on every reveal in `RoundResult.tsx`. The emoji set is chosen from a tier ladder
keyed on placement quality in [0,1] — the average of `axisAccuracy(xError)`/`axisAccuracy(yError)`
— climbing from sad faces (😢😭💀) through neutral/decent up to the eggplant tier (🍆💦🎉🥵) for a
near-perfect drop. Particle count, spread and velocity also scale with quality. Browser-only and
guarded by `prefersReducedMotion()` + `disableForReducedMotion`. _Why:_ user wanted a celebratory
result reaction whose emoji reflect how good the placement was, "from sad face to eggplant".
Tuned per user feedback to a single burst from the middle of the screen (`origin {0.5,0.5}`),
bigger emojis (`scalar: 4`) and slow/floaty motion (low `startVelocity`, `gravity: 0.4`,
`ticks: 400`) so the emojis are easy to read.

## 2026-06-17 — Kubernetes deployment on plasseringsspillet.stackunderflow.no

Added a minimal `k8s/` Kustomize overlay (namespace, deployment, service, HTTPRoute) for the
cluster managed in the `stackunderflow.no` repo. The container is the existing static nginx build
(`ghcr.io/bjorngi/ai-workshop-spill`), served on port 8080. The HTTPRoute attaches only to the
new `plasseringsspillet-https` listener in the shared Gateway, leaving the global port-80
HTTP→HTTPS redirect intact. No OIDC/PocketID protection: the game is a public static SPA.
The Gateway listener and TLS secret were added to the infrastructure repo separately because the
Gateway is shared cluster infrastructure, not per-app config.

## 2026-06-17 — Flux-driven image updates with timestamped semver tags

To make the cluster roll forward automatically when a new image is published, the CI workflow now
also tags every build with a semver-sortable tag: `0.0.0-<YYYYMMDDHHMMSS>.<shortsha>`.
`k8s/image-repository.yaml`, `k8s/image-policy.yaml`, and `k8s/image-update-automation.yaml`
watch the registry and rewrite the image tag in `k8s/deployment.yaml` (via the
`{"$imagepolicy": "flux-system:plasseringsspillet"}` marker). Flux then commits and pushes the
change back to the app repo's `main` branch.

To prevent the manifest commit from re-triggering CI and causing an infinite build loop, the
workflow now ignores pushes that only touch `k8s/**`, `flux/**`, `DECISIONS.md`, or `README.md`.

The cluster config in `stackunderflow.no` gets `plasseringsspillet.yaml` (a GitRepository +
Kustomization) which applies `./k8s` from `bjorngi/ai-workshop-spill`. The GitRepository uses a
deploy key secret `plasseringsspillet-flux-auth` that must be created once with write access.

The GHCR package must be public, or the Deployment needs `imagePullSecrets` and the
ImageRepository needs a matching `secretRef` so Flux can scan private tags.

## 2026-06-17 — Switch from SPA mode to React Router framework mode (ssr:true)

Flipped `ssr:false` → `ssr:true` so we can host a tiny in-memory WebRTC signaling server as a
resource route (`app/routes/api.room.$code.ts`) inside the same app — no separate backend. The
build now emits both `build/server` (the SSR entry) and `build/client` (browser assets). All
browser-only APIs (`RTCPeerConnection`, pointer events, Web Audio) stay inside effects/handlers,
never at module top-level, so server-rendering the shell remains safe. _Why:_ a resource route is
the smallest way to get a server endpoint without leaving the React Router stack.

## 2026-06-17 — N-player multiplayer via room codes (star / host-relay topology)

Replaced manual copy-paste SDP signaling with room codes. Topology is a star: each guest holds a
single `RTCDataChannel` to the host, and the host is the authoritative hub — it relays placements
between guests and drives the round flow. Round winners are computed locally and deterministically
on every client (closest total slot-error wins +1, ties share the point) so no result needs to be
trusted from the wire. _Why:_ scales past 2 players while keeping a single source of truth.

## 2026-06-17 — In-memory signaling mailbox (single replica)

The signaling resource route is a per-room mailbox held in a process-local `Map` with a ~10 min
TTL, exposing per-guest offer/answer slots that peers poll to exchange SDP. It is intentionally
stateful and ephemeral, which is fine for a single replica but is the reason we cannot scale out.

## 2026-06-17 — Dockerfile runs a Node SSR server; nginx removed

The Dockerfile is now a two-stage Node build that runs `react-router-serve` on `PORT=8080`
(matching the Service/HTTPRoute) instead of serving a static bundle via nginx; `nginx.conf` was
deleted since the Node server handles SPA fallback + asset serving. The k8s Deployment keeps
`replicas: 1` because the in-memory signaling mailbox and host-relay hub are not horizontally
scalable without sticky sessions or a shared store; memory limit bumped 256Mi → 384Mi for Node.
