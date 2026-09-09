export const TREASURE_VALUES = [1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17] as const;

export const HAZARD_COPIES = 3;
export const HAZARD_CHARM_COPIES = 2;
export const HAZARD_KINDS = ["shark", "jellyfish", "current", "collapse", "blackwater"] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

export const ARTIFACT_IDS = [0, 1, 2, 3, 4] as const;
export type ArtifactId = (typeof ARTIFACT_IDS)[number];

export const MAX_PLAYERS = 8;
export const MAX_SPECTATORS = 8;
export const MIN_PLAYERS = 3;
export const ROUND_COUNT = 5;

export type Phase =
  | "lobby"
  | "roundIntro"
  | "flipping"
  | "choosing"
  | "revealing"
  | "settling"
  | "collapsed"
  | "roundEnd"
  | "gameOver";

export type Choice = "stay" | "leave";

export type DeckCard =
  | { kind: "treasure"; value: number }
  | { kind: "hazard"; hazard: HazardKind }
  | { kind: "artifact"; artifactId: ArtifactId };

export type PathCard =
  | { id: string; kind: "treasure"; value: number; leftover: number }
  | { id: string; kind: "hazard"; hazard: HazardKind }
  | { id: string; kind: "artifact"; artifactId: ArtifactId };

export interface ClaimedArtifact {
  artifactId: ArtifactId;
  points: number;
}

export interface Spectator {
  id: string;
  name: string;
  emoji: string;
  connected: boolean;
}

export interface CrewTag {
  id: string;
  name: string;
  emoji: string;
}

export interface FathomBrief {
  reason: RoundEndReason;
  hazard: HazardKind | null;
  surfaced: CrewTag[];
  perished: CrewTag[];
}

export interface ActionBrief {
  surfaced: CrewTag[];
  leftoverShare: number;
  relics: number;
}

export interface Player {
  id: string;
  name: string;
  emoji: string;
  isBot: boolean;
  connected: boolean;
  tentGems: number;
  expeditionGems: number;
  artifacts: ClaimedArtifact[];
  inTemple: boolean;
  choice: Choice | null;
  lastChoice: Choice | null;
}

export type RoundEndReason = "all-left" | "hazard" | null;

export interface HouseRules {
  /** First three cards of each fathom skip hazards. */
  safeStart: boolean;
  /** Two copies per hazard; collapse does not remove that kind. */
  charm: boolean;
}

export const DEFAULT_HOUSE_RULES: HouseRules = { safeStart: false, charm: false };

export function hazardCopiesFor(rules: HouseRules | null | undefined): number {
  return rules?.charm ? HAZARD_CHARM_COPIES : HAZARD_COPIES;
}

export interface GameState {
  phase: Phase;
  round: number;
  seq: number;
  seed: number;
  hostId: string;
  players: Player[];
  deck: DeckCard[];
  path: PathCard[];
  discardedHazards: HazardKind[];
  artifactsToIntroduce: ArtifactId[];
  claimedArtifactCount: number;
  collapsingHazard: HazardKind | null;
  roundEndReason: RoundEndReason;
  lastHeadline: string;
  lastFathomBrief: FathomBrief | null;
  lastActionBrief: ActionBrief | null;
  surfacedThisRound: CrewTag[];
  perishedThisRound: CrewTag[];
  spectators: Spectator[];
  winners: string[];
  rules: HouseRules;
}

export interface PublicPlayer {
  id: string;
  name: string;
  emoji: string;
  isBot: boolean;
  connected: boolean;
  inTemple: boolean;
  expeditionGems: number;
  hasChosen: boolean;
  lastChoice: Choice | null;
  artifactCount: number;
  artifacts: ClaimedArtifact[];
  tentGems: number | null;
  score: number | null;
}

export interface PublicSnapshot {
  phase: Phase;
  round: number;
  seq: number;
  hostId: string;
  path: PathCard[];
  deckCount: number;
  discardedHazards: HazardKind[];
  claimedArtifactCount: number;
  collapsingHazard: HazardKind | null;
  roundEndReason: RoundEndReason;
  lastHeadline: string;
  lastFathomBrief: FathomBrief | null;
  lastActionBrief: ActionBrief | null;
  /** Relic shuffled into this fathom's deck. */
  roundArtifactId: ArtifactId | null;
  players: PublicPlayer[];
  spectators: Spectator[];
  winners: string[];
  rules: HouseRules;
}

export interface PrivateView {
  tentGems: number;
  artifacts: ClaimedArtifact[];
  choice: Choice | null;
}

export function artifactPointsForIndex(claimIndex: number): number {
  return claimIndex < 3 ? 5 : 10;
}

export function playerScore(player: Pick<Player, "tentGems" | "artifacts">): number {
  return player.tentGems + player.artifacts.reduce((sum, a) => sum + a.points, 0);
}

export const BOT_PRESETS: { name: string; emoji: string }[] = [
  { name: "老錨", emoji: "⚓" },
  { name: "青鱗", emoji: "🐟" },
  { name: "沉鐘", emoji: "🔔" },
  { name: "潮眼", emoji: "🐙" },
  { name: "艙底", emoji: "🐚" },
  { name: "羅盤", emoji: "🧭" },
  { name: "靜潛", emoji: "🫧" },
];

export const AVATAR_EMOJIS = [
  "🤿",
  "🐙",
  "🐋",
  "🐟",
  "🐠",
  "🦈",
  "🐚",
  "⚓",
  "🪸",
  "🧭",
  "🐢",
  "🦑",
  "🦀",
  "🦭",
  "🌊",
  "⛵",
] as const;
