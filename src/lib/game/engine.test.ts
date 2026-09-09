import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addPlayer,
  allExplorersChosen,
  canStart,
  createLobby,
  drawCard,
  enterChoosing,
  finishGame,
  fisherYates,
  leftoverOnPath,
  mulberry32,
  revealChoices,
  setChoice,
  settleLeaves,
  startGame,
  toPublicSnapshot,
  beginRound,
  addSpectator,
  ejectPlayer,
  setHouseRules,
  finishRound,
} from "./engine.ts";
import { artifactPointsForIndex, playerScore, type GameState, type Player } from "./types.ts";

function host(): GameState {
  return createLobby({ id: "h", name: "隊長", emoji: "⚓", isBot: false });
}

function withCrew(n: number): GameState {
  let s = host();
  for (let i = 1; i < n; i++) {
    s = addPlayer(s, { id: `p${i}`, name: `P${i}`, emoji: "🐟", isBot: true });
  }
  return s;
}

function forcePath(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch };
}

test("fisher-yates preserves membership", () => {
  const src = [1, 2, 3, 4, 5, 6, 7];
  const out = fisherYates(src, mulberry32(42));
  assert.deepEqual([...out].sort((a, b) => a - b), src);
  assert.equal(src.length, 7);
});

test("need 3 players to start", () => {
  assert.equal(canStart(withCrew(2)), false);
  assert.equal(canStart(withCrew(3)), true);
});

test("treasure 11 among 4 leaves 3 on the path", () => {
  let s = startGame(withCrew(4), 1);
  s = forcePath(s, {
    phase: "flipping",
    path: [],
    deck: [{ kind: "treasure", value: 11 }, ...s.deck],
    players: s.players.map((p) => ({ ...p, inTemple: true, expeditionGems: 0 })),
  });
  s = drawCard(s);
  assert.equal(s.path[0]?.kind, "treasure");
  if (s.path[0]?.kind === "treasure") assert.equal(s.path[0].leftover, 3);
  for (const p of s.players) assert.equal(p.expeditionGems, 2);
});

test("single leaver takes leftovers and relics", () => {
  let s = startGame(withCrew(3), 2);
  s = forcePath(s, {
    phase: "choosing",
    claimedArtifactCount: 0,
    path: [
      { id: "t", kind: "treasure", value: 7, leftover: 4 },
      { id: "a", kind: "artifact", artifactId: 0 },
    ],
    players: s.players.map((p, i) => ({
      ...p,
      inTemple: true,
      expeditionGems: i === 0 ? 3 : 1,
      choice: i === 0 ? "leave" : "stay",
    })),
  });
  s = revealChoices(s);
  s = settleLeaves(s);
  const captain = s.players.find((p) => p.id === "h")!;
  assert.equal(captain.inTemple, false);
  assert.equal(captain.tentGems, 3 + 4);
  assert.equal(captain.artifacts[0]?.points, 5);
  assert.equal(s.path.some((c) => c.kind === "artifact"), false);
  const pub = toPublicSnapshot(s, false);
  assert.equal(pub.players.find((p) => p.id === "h")?.artifacts[0]?.points, 5);
  assert.equal(s.players.filter((p) => p.inTemple).length, 2);
});

test("two leavers split leftovers and miss the relic", () => {
  let s = startGame(withCrew(3), 2);
  s = forcePath(s, {
    phase: "choosing",
    path: [
      { id: "t", kind: "treasure", value: 5, leftover: 5 },
      { id: "a", kind: "artifact", artifactId: 1 },
    ],
    players: s.players.map((p, i) => ({
      ...p,
      inTemple: true,
      expeditionGems: 2,
      choice: i < 2 ? "leave" : "stay",
    })),
  });
  s = revealChoices(s);
  s = settleLeaves(s);
  assert.equal(s.path.some((c) => c.kind === "artifact"), true);
  assert.equal(leftoverOnPath(s), 1);
});

test("second matching hazard dumps expedition gems, tent is safe", () => {
  let s = startGame(withCrew(3), 4);
  s = forcePath(s, {
    phase: "flipping",
    path: [{ id: "h1", kind: "hazard", hazard: "shark" }],
    deck: [{ kind: "hazard", hazard: "shark" }, ...s.deck],
    players: s.players.map((p, i) => ({
      ...p,
      inTemple: i === 0 ? false : true,
      tentGems: i === 0 ? 12 : 0,
      expeditionGems: i === 0 ? 0 : 7,
    })),
  });
  s = drawCard(s);
  assert.equal(s.phase, "collapsed");
  const captain = s.players.find((p) => p.id === "h")!;
  assert.equal(captain.tentGems, 12);
  assert.equal(s.perishedThisRound.length, 2);
  assert.equal(s.perishedThisRound.some((p) => p.id === "h"), false);
  for (const p of s.players.filter((p) => p.id !== "h")) {
    assert.equal(p.expeditionGems, 0);
    assert.equal(p.inTemple, false);
  }
});

test("artifact points follow claim order 5 5 5 10 10", () => {
  assert.equal(artifactPointsForIndex(0), 5);
  assert.equal(artifactPointsForIndex(2), 5);
  assert.equal(artifactPointsForIndex(3), 10);
  assert.equal(artifactPointsForIndex(4), 10);
});

test("finishGame breaks ties on relic count", () => {
  let s = startGame(withCrew(3), 8);
  s = forcePath(s, {
    players: s.players.map((p, i) => ({
      ...p,
      tentGems: 10,
      artifacts: i === 1 ? [{ artifactId: 0 as const, points: 5 }] : [],
    })),
  });
  s = finishGame(s);
  assert.equal(s.winners.length, 1);
  assert.equal(s.winners[0], "p1");
  assert.equal(playerScore(s.players.find((p) => p.id === "p1")!), 15);
});

test("first card of a round flips without a choice", () => {
  let s = startGame(withCrew(3), 9);
  assert.equal(s.phase, "roundIntro");
  s = drawCard(s);
  assert.ok(s.path.length === 1);
  assert.notEqual(s.phase, "choosing");
});

test("beginRound introduces one relic into the deck", () => {
  const s = startGame(withCrew(3), 7);
  const artifacts = s.deck.filter((c) => c.kind === "artifact");
  assert.equal(artifacts.length, 1);
});

test("leavers are listed on the next fathom", () => {
  let s = startGame(withCrew(3), 3);
  s = forcePath(s, {
    phase: "choosing",
    round: 1,
    path: [{ id: "t", kind: "treasure", value: 7, leftover: 4 }],
    players: s.players.map((p, i) => ({
      ...p,
      inTemple: true,
      expeditionGems: 0,
      choice: i === 0 ? "leave" : "stay",
    })),
  });
  s = revealChoices(s);
  s = settleLeaves(s);
  assert.equal(s.surfacedThisRound.length, 1);
  assert.equal(s.lastActionBrief?.surfaced.length, 1);
  s = beginRound({ ...s, roundEndReason: "all-left" }, mulberry32(1));
  assert.equal(s.lastFathomBrief?.reason, "all-left");
  assert.equal(s.lastFathomBrief?.perished.length, 0);
  assert.equal(s.lastActionBrief, null);
});

test("public snapshot marks explorers who locked a choice", () => {
  let s = startGame(withCrew(3), 5);
  s = forcePath(s, {
    phase: "choosing",
    players: s.players.map((p) => ({ ...p, inTemple: true, choice: null })),
  });
  s = setChoice(s, "h", "stay");
  const snap = toPublicSnapshot(s, false);
  const hostP = snap.players.find((p) => p.id === "h")!;
  const other = snap.players.find((p) => p.id === "p1")!;
  assert.equal(hostP.hasChosen, true);
  assert.equal(hostP.lastChoice, null);
  assert.equal(other.hasChosen, false);
  assert.equal(allExplorersChosen({ ...s, players: s.players.map((p) => ({ ...p, choice: "stay" as const })) }), true);
});

test("mid-game join becomes a spectator, not a diver", () => {
  let s = startGame(withCrew(3), 6);
  s = addSpectator(s, { id: "watch", name: "岸上", emoji: "👀" });
  assert.equal(s.players.some((p) => p.id === "watch"), false);
  assert.equal(s.spectators.length, 1);
  const snap = toPublicSnapshot(s, false);
  assert.equal(snap.spectators[0]?.name, "岸上");
  assert.equal(snap.players.length, 3);
});

test("ejecting the last diver ends the fathom", () => {
  let s = startGame(withCrew(3), 5);
  s = forcePath(s, {
    phase: "choosing",
    players: s.players.map((p) => ({ ...p, inTemple: p.id === "p1" })),
  });
  s = ejectPlayer(s, "p1");
  assert.equal(s.players.some((p) => p.id === "p1"), false);
  assert.equal(s.phase, "roundEnd");
});

test("safeStart skips hazards among the first three cards", () => {
  let s = startGame(withCrew(3), 1);
  s = forcePath(s, {
    rules: { safeStart: true, charm: false },
    path: [],
    deck: [
      { kind: "hazard", hazard: "shark" },
      { kind: "hazard", hazard: "jellyfish" },
      { kind: "treasure", value: 9 },
    ],
  });
  s = drawCard(s);
  assert.equal(s.path[0]?.kind, "treasure");
  assert.equal(s.deck.filter((c) => c.kind === "hazard").length, 2);
});

test("charm uses two copies and keeps them after collapse", () => {
  let s = setHouseRules(withCrew(3), { charm: true });
  s = startGame(s, 2);
  assert.equal(s.deck.filter((c) => c.kind === "hazard").length, 10);
  s = forcePath(s, {
    phase: "flipping",
    path: [{ id: "h1", kind: "hazard", hazard: "shark" }],
    deck: [{ kind: "hazard", hazard: "shark" }],
    discardedHazards: [],
    players: s.players.map((p) => ({ ...p, inTemple: true, expeditionGems: 4 })),
  });
  s = drawCard(s);
  assert.equal(s.phase, "collapsed");
  assert.equal(s.discardedHazards.length, 0);
  const sharksNow =
    s.deck.filter((c) => c.kind === "hazard" && c.hazard === "shark").length +
    s.path.filter((c) => c.kind === "hazard" && c.hazard === "shark").length;
  assert.equal(sharksNow, 2);
  s = finishRound(s, mulberry32(2));
  const sharksAfter =
    s.deck.filter((c) => c.kind === "hazard" && c.hazard === "shark").length +
    s.path.filter((c) => c.kind === "hazard" && c.hazard === "shark").length;
  assert.equal(sharksAfter, 2);
});
