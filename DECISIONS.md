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

## 2026-06-17 — Singleplayer mode

Besides 2-player WebRTC, the game must be playable solo. Solo mode skips all networking
(setup → pick game → play): you place each mystery card against the hidden true position and
accumulate a score based on how close you were (slot error per round). Same board/anchor
mechanics as multiplayer, just no opponent and no `PeerLink`.

## 2026-06-17 — No automated tests

Per user direction, we skip a test framework entirely ("rawdog it"). Correctness is checked
via `npm run typecheck` and manual two-window play-testing. Game-core functions are still kept
pure so they can be tested later if desired.
