// Shared type contract for the whole game. Every module (game core, WebRTC
// net layer, UI) codes against these. Keep this file dependency-free.

export type Scale = "linear" | "log";

/** Configuration for one axis of a game's grid. */
export interface AxisConfig {
  /** Human label, e.g. "Antall OL-gull" or "Utgivelsesår". */
  label: string;
  /** Optional unit suffix shown on tick labels, e.g. "cm", "moh". */
  unit?: string;
  /** Linear or logarithmic spacing. Log requires all values > 0. */
  scale: Scale;
  /** Optional fixed domain. If omitted it is derived from the theme's cards. */
  min?: number;
  /** Optional fixed domain. If omitted it is derived from the theme's cards. */
  max?: number;
}

/** A single placeable item. x maps to the X axis, y to the Y axis. */
export interface Card {
  id: string;
  title: string;
  x: number;
  y: number;
  /** Shown at reveal time to explain the true values. */
  blurb: string;
}

/** A "game": its two axes plus the cards that live on that grid. */
export interface Theme {
  id: string;
  name: string;
  description?: string;
  xAxis: AxisConfig;
  yAxis: AxisConfig;
  /** Cards shown as reference anchors from the start (not scored). */
  seedAnchorIds: string[];
  cards: Card[];
}

/**
 * A player's drop expressed as normalized fractions of the plot area, each in
 * [0, 1]. Origin is bottom-left: fx grows rightward (X axis), fy grows upward
 * (Y axis). Slots for scoring are derived from these + the shared anchor set,
 * so both peers compute identical results regardless of their pixel sizes.
 */
export interface Placement {
  fx: number;
  fy: number;
}

export type Role = "host" | "guest";

export type Phase =
  | "setup" // choose host or guest
  | "connect" // copy-paste WebRTC signaling
  | "lobby" // host picks the game; both enter names
  | "play" // dragging/placing the current card
  | "reveal" // round result shown
  | "gameover";

/** Messages exchanged over the RTCDataChannel (JSON-serialized). */
export type NetMessage =
  | { type: "hello"; name: string }
  | {
      type: "start";
      themeId: string;
      seed: number;
      /** Ordered ids of the seed anchor cards. */
      anchorIds: string[];
      /** Ordered ids of the mystery cards to play, round by round. */
      mysteryOrder: string[];
      hostName: string;
    }
  | { type: "place"; round: number; placement: Placement }
  | { type: "next"; round: number };
