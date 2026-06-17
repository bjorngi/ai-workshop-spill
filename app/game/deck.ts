// Deck building from a theme + seed. Pure and dependency-free.

import type { Card, Theme } from "~/game/types";
import { mulberry32, shuffle } from "~/game/rng";

/**
 * Build the deck for a game. Anchors are the theme's seed anchors (in order).
 * The mystery order is a deterministic shuffle (from the seed) of every card id
 * that is NOT a seed anchor.
 */
export function buildDeck(
  theme: Theme,
  seed: number,
): { anchorIds: string[]; mysteryOrder: string[] } {
  const anchorIds = theme.seedAnchorIds.slice();
  const anchorSet = new Set(anchorIds);
  const mysteryIds = theme.cards
    .map((c) => c.id)
    .filter((id) => !anchorSet.has(id));
  const mysteryOrder = shuffle(mysteryIds, mulberry32(seed));
  return { anchorIds, mysteryOrder };
}

/**
 * Map ids -> Card, preserving the requested order and skipping unknown ids.
 */
export function cardsByIds(theme: Theme, ids: string[]): Card[] {
  const byId = new Map(theme.cards.map((c) => [c.id, c]));
  const out: Card[] = [];
  for (const id of ids) {
    const card = byId.get(id);
    if (card) out.push(card);
  }
  return out;
}
