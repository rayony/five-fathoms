import {
  ARTIFACT_IDS,
  DEFAULT_HOUSE_RULES,
  HAZARD_KINDS,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  MIN_PLAYERS,
  ROUND_COUNT,
  TREASURE_VALUES,
  artifactPointsForIndex,
  hazardCopiesFor,
  playerScore,
  type ArtifactId,
  type Choice,
  type DeckCard,
  type GameState,
  type HazardKind,
  type HouseRules,
  type PathCard,
  type Player,
  type PrivateView,
  type PublicSnapshot,
} from "./types.ts";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fisherYates<T>(items: readonly T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

let cardSeq = 0;
function nextCardId(): string {
  cardSeq += 1;
  return `c${cardSeq}`;
}

function makeQuestDeck(copies: number): DeckCard[] {
  const treasures: DeckCard[] = TREASURE_VALUES.map((value) => ({ kind: "treasure", value }));
  const hazards: DeckCard[] = HAZARD_KINDS.flatMap((hazard) =>
    Array.from({ length: copies }, () => ({ kind: "hazard" as const, hazard })),
  );
  return [...treasures, ...hazards];
}

export function createLobby(host: Omit<Player, "tentGems" | "expeditionGems" | "artifacts" | "inTemple" | "choice" | "lastChoice" | "connected">): GameState {
  return {
    phase: "lobby",
    round: 0,
    seq: 1,
    seed: (Math.random() * 0xffffffff) >>> 0,
    hostId: host.id,
    players: [
      {
        ...host,
        connected: true,
        tentGems: 0,
        expeditionGems: 0,
        artifacts: [],
        inTemple: false,
        choice: null,
        lastChoice: null,
      },
    ],
    deck: [],
    path: [],
    discardedHazards: [],
    artifactsToIntroduce: [...ARTIFACT_IDS],
    claimedArtifactCount: 0,
    collapsingHazard: null,
    roundEndReason: null,
    lastHeadline: "",
    lastFathomBrief: null,
    lastActionBrief: null,
    surfacedThisRound: [],
    perishedThisRound: [],
    spectators: [],
    winners: [],
    rules: { ...DEFAULT_HOUSE_RULES },
  };
}

export function setHouseRules(state: GameState, patch: Partial<HouseRules>): GameState {
  if (state.phase !== "lobby") return state;
  return {
    ...state,
    seq: state.seq + 1,
    rules: { ...DEFAULT_HOUSE_RULES, ...state.rules, ...patch },
  };
}

export function addPlayer(state: GameState, player: Pick<Player, "id" | "name" | "emoji" | "isBot">): GameState {
  if (state.phase !== "lobby") return state;
  if (state.players.some((p) => p.id === player.id)) {
    return {
      ...state,
      seq: state.seq + 1,
      players: state.players.map((p) =>
        p.id === player.id ? { ...p, name: player.name, emoji: player.emoji, connected: true } : p,
      ),
    };
  }
  if (state.players.length >= MAX_PLAYERS) return state;
  return {
    ...state,
    seq: state.seq + 1,
    players: [
      ...state.players,
      {
        ...player,
        connected: true,
        tentGems: 0,
        expeditionGems: 0,
        artifacts: [],
        inTemple: false,
        choice: null,
        lastChoice: null,
      },
    ],
  };
}

export function addSpectator(
  state: GameState,
  person: Pick<Player, "id" | "name" | "emoji">,
): GameState {
  if (state.phase === "lobby") return addPlayer(state, { ...person, isBot: false });
  if (state.players.some((p) => p.id === person.id)) {
    return {
      ...state,
      seq: state.seq + 1,
      players: state.players.map((p) =>
        p.id === person.id
          ? { ...p, name: person.name, emoji: person.emoji, connected: true }
          : p,
      ),
    };
  }
  if (state.spectators.some((s) => s.id === person.id)) {
    return {
      ...state,
      seq: state.seq + 1,
      spectators: state.spectators.map((s) =>
        s.id === person.id
          ? { ...s, name: person.name, emoji: person.emoji, connected: true }
          : s,
      ),
    };
  }
  if (state.spectators.length >= MAX_SPECTATORS) return state;
  return {
    ...state,
    seq: state.seq + 1,
    spectators: [
      ...state.spectators,
      { id: person.id, name: person.name, emoji: person.emoji, connected: true },
    ],
  };
}

export function ejectPlayer(state: GameState, id: string): GameState {
  if (id === state.hostId) return state;
  const asPlayer = state.players.some((p) => p.id === id);
  const asSpec = state.spectators.some((s) => s.id === id);
  if (!asPlayer && !asSpec) return state;
  const players = state.players.filter((p) => p.id !== id);
  const spectators = state.spectators.filter((s) => s.id !== id);
  let { phase, roundEndReason, lastHeadline } = state;
  if (
    asPlayer &&
    phase !== "lobby" &&
    phase !== "gameOver" &&
    phase !== "roundEnd" &&
    phase !== "collapsed" &&
    !players.some((p) => p.inTemple)
  ) {
    phase = "roundEnd";
    roundEndReason = "all-left";
  }
  return {
    ...state,
    seq: state.seq + 1,
    players,
    spectators,
    phase,
    roundEndReason,
    lastHeadline,
  };
}

export function removePlayer(state: GameState, id: string): GameState {
  if (id === state.hostId) return state;
  if (state.phase === "lobby") {
    return { ...state, seq: state.seq + 1, players: state.players.filter((p) => p.id !== id) };
  }
  return {
    ...state,
    seq: state.seq + 1,
    players: state.players.map((p) => (p.id === id ? { ...p, connected: false } : p)),
    spectators: state.spectators.map((s) => (s.id === id ? { ...s, connected: false } : s)),
  };
}

export function canStart(state: GameState): boolean {
  return state.phase === "lobby" && state.players.length >= MIN_PLAYERS && state.players.length <= MAX_PLAYERS;
}

function resetPlayerForRound(p: Player): Player {
  return {
    ...p,
    expeditionGems: 0,
    inTemple: true,
    choice: null,
    lastChoice: null,
  };
}

function leftoverTotal(path: PathCard[]): number {
  return path.reduce((sum, card) => (card.kind === "treasure" ? sum + card.leftover : sum), 0);
}

function setPathLeftover(path: PathCard[], amount: number): PathCard[] {
  let remaining = amount;
  return path.map((card) => {
    if (card.kind !== "treasure") return card;
    const leftover = remaining;
    remaining = 0;
    return { ...card, leftover };
  });
}

function seenHazardCounts(path: PathCard[]): Record<HazardKind, number> {
  const counts = Object.fromEntries(HAZARD_KINDS.map((h) => [h, 0])) as Record<HazardKind, number>;
  for (const card of path) {
    if (card.kind === "hazard") counts[card.hazard] += 1;
  }
  return counts;
}

export function startGame(state: GameState, seed?: number): GameState {
  if (!canStart(state)) return state;
  const nextSeed = seed ?? state.seed;
  const rng = mulberry32(nextSeed);
  return beginRound(
    {
      ...state,
      seed: nextSeed,
      round: 0,
      deck: makeQuestDeck(hazardCopiesFor(state.rules)),
      path: [],
      discardedHazards: [],
      artifactsToIntroduce: fisherYates(ARTIFACT_IDS, rng),
      claimedArtifactCount: 0,
      collapsingHazard: null,
      roundEndReason: null,
      lastHeadline: "",
      lastFathomBrief: null,
      lastActionBrief: null,
      surfacedThisRound: [],
      perishedThisRound: [],
      winners: [],
      players: state.players.map((p) => ({
        ...p,
        tentGems: 0,
        expeditionGems: 0,
        artifacts: [],
        inTemple: true,
        choice: null,
        lastChoice: null,
      })),
    },
    rng,
  );
}

export function beginRound(state: GameState, rng: () => number): GameState {
  const round = state.round + 1;
  if (round > ROUND_COUNT) return finishGame(state);

  const leftoverDeck: DeckCard[] = state.deck.map((c) =>
    c.kind === "treasure" ? { kind: "treasure", value: c.value } : c,
  );
  for (const card of state.path) {
    if (card.kind === "artifact") continue;
    if (card.kind === "treasure") leftoverDeck.push({ kind: "treasure", value: card.value });
    else leftoverDeck.push({ kind: "hazard", hazard: card.hazard });
  }

  const incoming = state.artifactsToIntroduce[round - 1];
  if (incoming !== undefined) leftoverDeck.push({ kind: "artifact", artifactId: incoming });

  const deck = fisherYates(leftoverDeck, rng);
  return {
    ...state,
    seq: state.seq + 1,
    phase: "roundIntro",
    round,
    deck,
    path: [],
    collapsingHazard: null,
    roundEndReason: null,
    lastHeadline: `第 ${round} 尋`,
    lastFathomBrief:
      state.round === 0 || !state.roundEndReason
        ? null
        : {
            reason: state.roundEndReason,
            hazard: state.collapsingHazard,
            surfaced: state.surfacedThisRound,
            perished: state.perishedThisRound,
          },
    lastActionBrief: null,
    surfacedThisRound: [],
    perishedThisRound: [],
    players: state.players.map(resetPlayerForRound),
  };
}

function pickDrawn(state: GameState): { drawn: DeckCard; rest: DeckCard[] } | null {
  if (state.deck.length === 0) return null;
  const safe = Boolean(state.rules?.safeStart) && state.path.length < 3;
  if (!safe) {
    const [drawn, ...rest] = state.deck;
    return drawn ? { drawn, rest } : null;
  }
  const rng = mulberry32((state.seed + state.seq * 17) >>> 0);
  const held: DeckCard[] = [];
  const pile = state.deck.slice();
  while (pile.length) {
    const card = pile.shift()!;
    if (card.kind !== "hazard") {
      return { drawn: card, rest: fisherYates([...pile, ...held], rng) };
    }
    held.push(card);
  }
  const drawn = held[0];
  return drawn ? { drawn, rest: held.slice(1) } : null;
}

export function drawCard(state: GameState): GameState {
  const explorers = state.players.filter((p) => p.inTemple);
  if (explorers.length === 0 || state.deck.length === 0) {
    return { ...state, seq: state.seq + 1, phase: "roundEnd", roundEndReason: "all-left", lastHeadline: "全員上水" };
  }

  const picked = pickDrawn(state);
  if (!picked) {
    return { ...state, seq: state.seq + 1, phase: "roundEnd", roundEndReason: "all-left", lastHeadline: "艙底已空" };
  }
  const { drawn, rest } = picked;

  if (drawn.kind === "treasure") {
    const share = Math.floor(drawn.value / explorers.length);
    const leftover = drawn.value % explorers.length;
    const explorerIds = new Set(explorers.map((p) => p.id));
    const path: PathCard[] = [
      ...state.path,
      { id: nextCardId(), kind: "treasure", value: drawn.value, leftover },
    ];
    return {
      ...state,
      seq: state.seq + 1,
      phase: "flipping",
      deck: rest,
      path,
      lastHeadline: leftover ? `均分 ${share}，路上留 ${leftover}` : `每人 ${share} 顆珍珠`,
      players: state.players.map((p) =>
        explorerIds.has(p.id) ? { ...p, expeditionGems: p.expeditionGems + share } : p,
      ),
    };
  }

  if (drawn.kind === "artifact") {
    return {
      ...state,
      seq: state.seq + 1,
      phase: "flipping",
      deck: rest,
      path: [...state.path, { id: nextCardId(), kind: "artifact", artifactId: drawn.artifactId }],
      lastHeadline: "發現遺物，留在艙道上",
    };
  }

  const counts = seenHazardCounts(state.path);
  const already = counts[drawn.hazard] ?? 0;
  const path: PathCard[] = [...state.path, { id: nextCardId(), kind: "hazard", hazard: drawn.hazard }];
  if (already >= 1) {
    return {
      ...state,
      seq: state.seq + 1,
      phase: "collapsed",
      deck: rest,
      path,
      collapsingHazard: drawn.hazard,
      roundEndReason: "hazard",
      lastHeadline: "同種災難再現，艙內盡棄",
      discardedHazards: state.rules?.charm ? state.discardedHazards : [...state.discardedHazards, drawn.hazard],
      perishedThisRound: state.players
        .filter((p) => p.inTemple)
        .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
      players: state.players.map((p) => (p.inTemple ? { ...p, expeditionGems: 0, inTemple: false } : p)),
    };
  }

  return {
    ...state,
    seq: state.seq + 1,
    phase: "flipping",
    deck: rest,
    path,
    lastHeadline: "艙內響起異聲……尚未崩塌",
  };
}

export function enterChoosing(state: GameState): GameState {
  const explorers = state.players.filter((p) => p.inTemple);
  if (explorers.length === 0) return { ...state, phase: "roundEnd", roundEndReason: state.roundEndReason ?? "all-left" };
  if (state.phase === "collapsed") return state;
  return {
    ...state,
    seq: state.seq + 1,
    phase: "choosing",
    lastHeadline: "再潛，或上水？",
    players: state.players.map((p) => ({ ...p, choice: null, lastChoice: p.inTemple ? null : p.lastChoice })),
  };
}

export function setChoice(state: GameState, playerId: string, choice: Choice): GameState {
  if (state.phase !== "choosing") return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.inTemple || player.choice) return state;
  return {
    ...state,
    seq: state.seq + 1,
    players: state.players.map((p) => (p.id === playerId ? { ...p, choice } : p)),
  };
}

export function allExplorersChosen(state: GameState): boolean {
  return state.players.filter((p) => p.inTemple).every((p) => p.choice !== null);
}

export function revealChoices(state: GameState): GameState {
  return {
    ...state,
    seq: state.seq + 1,
    phase: "revealing",
    players: state.players.map((p) => ({ ...p, lastChoice: p.inTemple ? p.choice : p.lastChoice })),
    lastHeadline: "揭曉決定",
    lastFathomBrief: null,
  };
}

export function settleLeaves(state: GameState): GameState {
  const leavers = state.players.filter((p) => p.inTemple && p.choice === "leave");
  const stayers = state.players.filter((p) => p.inTemple && p.choice !== "leave");

  if (leavers.length === 0) {
    return {
      ...state,
      seq: state.seq + 1,
      phase: stayers.length ? "settling" : "roundEnd",
      roundEndReason: stayers.length ? state.roundEndReason : "all-left",
      lastHeadline: stayers.length ? "無人上水，繼續下潛" : "全員上水",
      lastActionBrief: { surfaced: [], leftoverShare: 0, relics: 0 },
      lastFathomBrief: null,
    };
  }

  const pile = leftoverTotal(state.path);
  const share = Math.floor(pile / leavers.length);
  const rem = pile % leavers.length;
  const leaverIds = new Set(leavers.map((p) => p.id));
  const takeArtifacts = leavers.length === 1;
  const pathArtifacts = state.path.filter((c) => c.kind === "artifact");

  let claimed = state.claimedArtifactCount;
  const awarded: ClaimedArtifactAward[] = [];
  if (takeArtifacts) {
    for (const card of pathArtifacts) {
      if (card.kind !== "artifact") continue;
      awarded.push({
        playerId: leavers[0]!.id,
        artifact: { artifactId: card.artifactId, points: artifactPointsForIndex(claimed) },
      });
      claimed += 1;
    }
  }

  const nextPath = setPathLeftover(
    takeArtifacts ? state.path.filter((c) => c.kind !== "artifact") : state.path,
    rem,
  );

  const players = state.players.map((p) => {
    if (!leaverIds.has(p.id)) return p;
    const extra = awarded.filter((a) => a.playerId === p.id).map((a) => a.artifact);
    return {
      ...p,
      tentGems: p.tentGems + p.expeditionGems + share,
      expeditionGems: 0,
      artifacts: extra.length ? [...p.artifacts, ...extra] : p.artifacts,
      inTemple: false,
      choice: null,
    };
  });

  const stillIn = players.some((p) => p.inTemple);
  const artifactNote = takeArtifacts && awarded.length ? `，獨得 ${awarded.length} 件遺物` : "";
  return {
    ...state,
    seq: state.seq + 1,
    phase: stillIn ? "settling" : "roundEnd",
    roundEndReason: stillIn ? state.roundEndReason : "all-left",
    path: nextPath,
    claimedArtifactCount: claimed,
    lastHeadline: `${leavers.length === 1 ? leavers[0]!.name : `${leavers.length} 人`}上水，均分路上 ${share}${artifactNote}`,
    lastActionBrief: {
      surfaced: leavers.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
      leftoverShare: leavers.length ? share : 0,
      relics: awarded.length,
    },
    lastFathomBrief: null,
    surfacedThisRound: [
      ...state.surfacedThisRound,
      ...leavers.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
    ],
    players,
  };
}

interface ClaimedArtifactAward {
  playerId: string;
  artifact: { artifactId: ArtifactId; points: number };
}

export function finishRound(state: GameState, rng: () => number): GameState {
  const surviving: DeckCard[] = [];
  const collapsing = state.collapsingHazard;
  const charm = Boolean(state.rules?.charm);
  let removedOneCollapse = false;
  for (const card of state.path) {
    if (card.kind === "artifact") continue;
    if (!charm && card.kind === "hazard" && collapsing && card.hazard === collapsing && !removedOneCollapse) {
      removedOneCollapse = true;
      continue;
    }
    if (card.kind === "treasure") surviving.push({ kind: "treasure", value: card.value });
    else surviving.push({ kind: "hazard", hazard: card.hazard });
  }
  surviving.push(...state.deck);

  const next: GameState = {
    ...state,
    deck: surviving,
    path: [],
    players: state.players.map((p) => ({
      ...p,
      expeditionGems: 0,
      inTemple: false,
      choice: null,
    })),
  };

  if (state.round >= ROUND_COUNT) return finishGame(next);
  return beginRound({ ...next, phase: "roundEnd" }, rng);
}

export function finishGame(state: GameState): GameState {
  const ranked = [...state.players].sort((a, b) => {
    const score = playerScore(b) - playerScore(a);
    if (score !== 0) return score;
    return b.artifacts.length - a.artifacts.length;
  });
  const top = ranked[0];
  const winners = top
    ? ranked
        .filter(
          (p) => playerScore(p) === playerScore(top) && p.artifacts.length === top.artifacts.length,
        )
        .map((p) => p.id)
    : [];
  return {
    ...state,
    seq: state.seq + 1,
    phase: "gameOver",
    lastHeadline: "五尋已盡",
    winners,
    players: state.players.map((p) => ({ ...p, inTemple: false, expeditionGems: 0, choice: null })),
  };
}

export function autoStayDisconnected(state: GameState): GameState {
  if (state.phase !== "choosing") return state;
  return {
    ...state,
    seq: state.seq + 1,
    players: state.players.map((p) =>
      p.inTemple && !p.connected && !p.isBot && !p.choice ? { ...p, choice: "stay" as const } : p,
    ),
  };
}

export function toPublicSnapshot(state: GameState, revealTents: boolean): PublicSnapshot {
  return {
    phase: state.phase,
    round: state.round,
    seq: state.seq,
    hostId: state.hostId,
    path: state.path,
    deckCount: state.deck.length,
    discardedHazards: state.discardedHazards,
    claimedArtifactCount: state.claimedArtifactCount,
    collapsingHazard: state.collapsingHazard,
    roundEndReason: state.roundEndReason,
    lastHeadline: state.lastHeadline,
    lastFathomBrief: state.lastFathomBrief,
    lastActionBrief: state.lastActionBrief,
    roundArtifactId: state.round > 0 ? (state.artifactsToIntroduce[state.round - 1] ?? null) : null,
    winners: state.winners,
    spectators: state.spectators,
    rules: state.rules ?? DEFAULT_HOUSE_RULES,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      isBot: p.isBot,
      connected: p.connected,
      inTemple: p.inTemple,
      expeditionGems: p.expeditionGems,
      hasChosen: p.choice !== null,
      lastChoice: state.phase === "choosing" ? null : p.lastChoice,
      artifactCount: p.artifacts.length,
      artifacts: p.artifacts,
      tentGems: revealTents || state.phase === "gameOver" ? p.tentGems : null,
      score: state.phase === "gameOver" ? playerScore(p) : null,
    })),
  };
}

export function toPrivateView(state: GameState, playerId: string): PrivateView | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  return {
    tentGems: player.tentGems,
    artifacts: player.artifacts,
    choice: player.choice,
  };
}

export function leftoverOnPath(state: GameState): number {
  return leftoverTotal(state.path);
}

export function artifactsOnPath(state: GameState): ArtifactId[] {
  return state.path.filter((c): c is Extract<PathCard, { kind: "artifact" }> => c.kind === "artifact").map((c) => c.artifactId);
}
