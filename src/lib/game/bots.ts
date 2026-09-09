import { leftoverOnPath, mulberry32 } from "./engine";
import type { Choice, GameState, HazardKind, PathCard } from "./types";
import { HAZARD_KINDS } from "./types";

function hazardCounts(path: PathCard[]): Record<HazardKind, number> {
  const counts = Object.fromEntries(HAZARD_KINDS.map((h) => [h, 0])) as Record<HazardKind, number>;
  for (const card of path) {
    if (card.kind === "hazard") counts[card.hazard] += 1;
  }
  return counts;
}

/** Heuristic press-your-luck brain. Personality comes from player index. */
export function botChoice(state: GameState, playerId: string): Choice {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.inTemple) return "leave";

  const explorers = state.players.filter((p) => p.inTemple);
  const rng = mulberry32((state.seed ^ state.seq ^ playerId.split("").reduce((s, c) => s + c.charCodeAt(0), 0)) >>> 0);
  const nerve = 0.28 + (playerId.charCodeAt(playerId.length - 1) % 5) * 0.08;
  const counts = hazardCounts(state.path);
  const armed = HAZARD_KINDS.filter((h) => counts[h] === 1).length;
  const deck = Math.max(1, state.deck.length);
  const collapseChance = armed / deck;
  const pile = leftoverOnPath(state);
  const artifacts = state.path.filter((c) => c.kind === "artifact").length;
  const alone = explorers.length === 1;

  if (player.expeditionGems === 0 && pile === 0 && artifacts === 0) return "stay";
  if (alone && artifacts > 0 && collapseChance > 0.18) return "leave";
  if (alone && player.expeditionGems + pile >= 12 && collapseChance > 0.12) return "leave";
  if (collapseChance > nerve + 0.12 && player.expeditionGems > 0) return "leave";
  if (explorers.length >= 4 && player.expeditionGems >= 10 && rng() > 0.45) return "leave";
  if (armed >= 3 && player.expeditionGems > 4) return "leave";
  return rng() < collapseChance * (1.6 - nerve) ? "leave" : "stay";
}

export function botDelayMs(playerId: string, seq: number): number {
  const base = 700 + (playerId.charCodeAt(playerId.length - 1) % 7) * 140;
  return base + (seq % 5) * 80;
}
