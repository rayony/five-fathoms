import { create } from "zustand";
import { botChoice, botDelayMs } from "./bots";
import {
  addPlayer,
  addSpectator,
  allExplorersChosen,
  autoStayDisconnected,
  canStart,
  createLobby,
  drawCard,
  ejectPlayer,
  enterChoosing,
  finishRound,
  mulberry32,
  removePlayer,
  revealChoices,
  setChoice,
  settleLeaves,
  startGame,
  setHouseRules as applyHouseRules,
  toPrivateView,
  toPublicSnapshot,
} from "./engine";
import { isReaction, parseChoice, randomRoomCode } from "./protocol";
import { TIMING } from "./timing";
import type { Locale } from "./i18n";
import type { Choice, GameState, HouseRules, PrivateView, PublicSnapshot } from "./types";
import { MAX_PLAYERS } from "./types";
import type { PeerInfo } from "@/lib/multiplayer";

const PROFILE_KEY = "ff-profile";
const timers = new Set<number>();
const banned = new Set<string>();
const BURST_MS = 2800;
let burstTimer: number | null = null;

function later(ms: number, fn: () => void) {
  if (typeof window === "undefined") return;
  const id = window.setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
}

function clearTimers() {
  for (const id of timers) window.clearTimeout(id);
  timers.clear();
}

export interface LiveReaction {
  emoji: string;
  fromId: string;
  name: string;
  avatar: string;
  at: number;
}

export interface KickVote {
  targetId: string;
  name: string;
  emoji: string;
  until: number;
}

const BOTS = [
  { name: "老錨", emoji: "⚓" },
  { name: "青鱗", emoji: "🐟" },
  { name: "沉鐘", emoji: "🔔" },
  { name: "潮眼", emoji: "🐙" },
  { name: "艙底", emoji: "🐚" },
  { name: "羅盤", emoji: "🧭" },
  { name: "靜潛", emoji: "🫧" },
] as const;

type Mode = "idle" | "local" | "online";
type Screen = "landing" | "lobby" | "play";
type SendFn = (data: unknown, peerId?: string) => void;
type DropFn = (peerId: string) => void;

function loadProfile(): { name: string; emoji: string; locale: Locale } {
  if (typeof window === "undefined") return { name: "", emoji: "🤿", locale: "zh-Hant" };
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return { name: "", emoji: "🤿", locale: "zh-Hant" };
    const parsed = JSON.parse(raw) as { name?: string; emoji?: string; locale?: string };
    return {
      name: parsed.name?.slice(0, 12) ?? "",
      emoji: parsed.emoji || "🤿",
      locale: parsed.locale === "en" ? "en" : "zh-Hant",
    };
  } catch {
    return { name: "", emoji: "🤿", locale: "zh-Hant" };
  }
}

function saveProfile(name: string, emoji: string, locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, emoji, locale }));
}

function newId() {
  return `p-${Math.random().toString(36).slice(2, 10)}`;
}

interface GameStore {
  locale: Locale;
  name: string;
  emoji: string;
  selfId: string;
  screen: Screen;
  mode: Mode;
  isHost: boolean;
  roomCode: string | null;
  hostGone: boolean;
  kicked: boolean;
  game: GameState | null;
  snapshot: PublicSnapshot | null;
  privateView: PrivateView | null;
  peers: PeerInfo[];
  signalCount: number;
  rulesOpen: boolean;
  send: SendFn | null;
  dropPeer: DropFn | null;
  reaction: LiveReaction | null;
  audioReady: boolean;
  kickVote: KickVote | null;
  rematchInvite: boolean;
  rematchAccepted: boolean;
  rematchSkipped: string[];
  setLocale: (locale: Locale) => void;
  setName: (name: string) => void;
  setEmoji: (emoji: string) => void;
  setRulesOpen: (open: boolean) => void;
  setSend: (send: SendFn | null) => void;
  setDropPeer: (drop: DropFn | null) => void;
  setPeers: (peers: PeerInfo[]) => void;
  setSignalCount: (n: number) => void;
  createRoom: (rules?: Partial<HouseRules>) => void;
  joinRoom: (code: string) => void;
  startPractice: (rules?: Partial<HouseRules>) => void;
  setHouseRules: (patch: Partial<HouseRules>) => void;
  addBot: () => void;
  removeBot: (id: string) => void;
  kick: (id: string) => void;
  startDive: () => void;
  choose: (stay: boolean) => void;
  playAgain: () => void;
  resetHome: () => void;
  onNetMessage: (from: string, data: unknown) => void;
  onRoster: (peers: PeerInfo[]) => void;
  pushJoin: () => void;
  republish: () => void;
  react: (emoji: string) => void;
  setAudioReady: (ready: boolean) => void;
  proposeKick: (id: string) => void;
  secondKick: () => void;
  acceptRematch: () => void;
  declineRematch: () => void;
}

function publish(game: GameState, selfId: string, send: SendFn | null, isHost: boolean) {
  const snapshot = toPublicSnapshot(game, false);
  const privateView = toPrivateView(game, selfId);
  if (isHost && send) {
    const playerIds = new Set(game.players.map((p) => p.id));
    for (const p of [...game.players, ...game.spectators]) {
      if (("isBot" in p && p.isBot) || p.id === selfId) continue;
      send(
        {
          t: "snapshot",
          public: snapshot,
          private: playerIds.has(p.id) ? toPrivateView(game, p.id) : undefined,
        },
        p.id,
      );
    }
  }
  return { snapshot, privateView };
}

function pushIdentity(get: () => GameStore, commit: (g: GameState, extra?: Partial<GameStore>) => void) {
  const { isHost, game, selfId, name, emoji, mode, screen, send } = get();
  if (isHost && game?.phase === "lobby") {
    commit(addPlayer(game, { id: selfId, name: name.trim() || "隊長", emoji, isBot: false }));
    return;
  }
  if (!isHost && mode === "online" && screen === "lobby") {
    send?.({ t: "join", name: name.trim() || "潛伴", emoji });
  }
}

export const useGameStore = create<GameStore>((set, get) => {
  const profile = loadProfile();
  const selfId = newId();

  const commit = (game: GameState, extra?: Partial<GameStore>) => {
    const { selfId: id, send, isHost } = get();
    const views = publish(game, id, send, isHost);
    set({
      game,
      snapshot: views.snapshot,
      privateView: views.privateView,
      screen: game.phase === "lobby" ? "lobby" : "play",
      ...extra,
    });
    drive(game);
  };

  const revealBurst = (burst: Omit<LiveReaction, "at">) => {
    const at = Date.now();
    set({ reaction: { ...burst, at } });
    if (typeof window === "undefined") return;
    if (burstTimer) window.clearTimeout(burstTimer);
    burstTimer = window.setTimeout(() => {
      burstTimer = null;
      if (get().reaction?.at === at) set({ reaction: null });
    }, BURST_MS);
  };

  const drive = (game: GameState) => {
    if (!get().isHost && get().mode !== "local") return;
    const seq = game.seq;

    const still = (fn: (g: GameState) => GameState, ms: number) => {
      later(ms, () => {
        const current = get().game;
        if (!current || current.seq !== seq) return;
        commit(fn(current));
      });
    };

    switch (game.phase) {
      case "roundIntro":
        if (!get().audioReady) return;
        still(drawCard, TIMING.roundIntro);
        break;
      case "flipping":
        still(enterChoosing, TIMING.flipping);
        break;
      case "collapsed":
        still((g) => finishRound(g, mulberry32(g.seed ^ (g.round * 17))), TIMING.collapsed);
        break;
      case "choosing": {
        for (const p of game.players) {
          if (!p.isBot || !p.inTemple || p.choice) continue;
          const pid = p.id;
          later(botDelayMs(pid, seq), () => {
            const current = get().game;
            if (!current || current.seq < seq || current.phase !== "choosing") return;
            commit(setChoice(current, pid, botChoice(current, pid)));
          });
        }
        later(10000, () => {
          const current = get().game;
          if (!current || current.phase !== "choosing") return;
          commit(autoStayDisconnected(current));
        });
        if (allExplorersChosen(game)) still(revealChoices, 280);
        break;
      }
      case "revealing":
        still(settleLeaves, TIMING.revealing);
        break;
      case "settling":
        still((g) => {
          if (g.players.some((p) => p.inTemple)) return drawCard(g);
          return { ...g, phase: "roundEnd", roundEndReason: "all-left", lastHeadline: g.lastHeadline };
        }, TIMING.settling);
        break;
      case "roundEnd":
        still((g) => finishRound(g, mulberry32(g.seed ^ (g.round * 17))), TIMING.roundEnd);
        break;
      default:
        break;
    }
  };

  const applyKick = (targetId: string) => {
    const { game, send, dropPeer } = get();
    if (!game) return;
    banned.add(targetId);
    send?.({ t: "kicked" }, targetId);
    dropPeer?.(targetId);
    set({ kickVote: null });
    send?.({ t: "kick-cancel" });
    commit(ejectPlayer(game, targetId));
  };

  return {
    locale: profile.locale,
    name: profile.name,
    emoji: profile.emoji,
    selfId,
    screen: "landing",
    mode: "idle",
    isHost: false,
    roomCode: null,
    hostGone: false,
    kicked: false,
    game: null,
    snapshot: null,
    privateView: null,
    peers: [],
    signalCount: 0,
    rulesOpen: false,
    send: null,
    dropPeer: null,
    reaction: null,
    audioReady: false,
    kickVote: null,
    rematchInvite: false,
    rematchAccepted: false,
    rematchSkipped: [],
    setLocale: (locale) => {
      const { name, emoji } = get();
      saveProfile(name, emoji, locale);
      set({ locale });
    },
    setName: (name) => {
      const next = name.slice(0, 12);
      const { emoji, locale } = get();
      saveProfile(next, emoji, locale);
      set({ name: next });
      pushIdentity(get, commit);
    },
    setEmoji: (emoji) => {
      const { name, locale } = get();
      saveProfile(name, emoji, locale);
      set({ emoji });
      pushIdentity(get, commit);
    },
    setRulesOpen: (rulesOpen) => set({ rulesOpen }),
    setSend: (send) => {
      set({ send });
      const { game, selfId: id, isHost } = get();
      if (game && isHost && send) publish(game, id, send, true);
    },
    setDropPeer: (dropPeer) => set({ dropPeer }),
    setPeers: (peers) => set({ peers }),
    setSignalCount: (signalCount) => set({ signalCount }),
    createRoom: (rules) => {
      clearTimers();
      banned.clear();
      const { selfId: id, name, emoji } = get();
      const roomCode = randomRoomCode();
      let game = createLobby({ id, name: name.trim() || "隊長", emoji, isBot: false });
      if (rules) game = applyHouseRules(game, rules);
      set({
        mode: "online",
        isHost: true,
        roomCode,
        hostGone: false,
        kicked: false,
        screen: "lobby",
        game,
        snapshot: toPublicSnapshot(game, false),
        privateView: toPrivateView(game, id),
        kickVote: null,
        rematchInvite: false,
        rematchAccepted: false,
        rematchSkipped: [],
      });
    },
    joinRoom: (code) => {
      clearTimers();
      banned.clear();
      const roomCode = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
      if (!roomCode) return;
      set({
        mode: "online",
        isHost: false,
        roomCode,
        hostGone: false,
        kicked: false,
        screen: "lobby",
        game: null,
        snapshot: null,
        privateView: null,
        kickVote: null,
        rematchInvite: false,
        rematchAccepted: false,
        rematchSkipped: [],
      });
    },
    startPractice: (rules) => {
      clearTimers();
      const { selfId: id, name, emoji } = get();
      let game = createLobby({ id, name: name.trim() || "潛水員", emoji, isBot: false });
      if (rules) game = applyHouseRules(game, rules);
      game = addPlayer(game, { id: "bot-1", name: BOTS[0].name, emoji: BOTS[0].emoji, isBot: true });
      game = addPlayer(game, { id: "bot-2", name: BOTS[1].name, emoji: BOTS[1].emoji, isBot: true });
      game = startGame(game);
      set({ mode: "local", isHost: true, roomCode: null, hostGone: false });
      commit(game);
    },
    setHouseRules: (patch) => {
      const game = get().game;
      if (!game || !get().isHost || game.phase !== "lobby") return;
      commit(applyHouseRules(game, patch));
    },
    addBot: () => {
      const game = get().game;
      if (!game || game.phase !== "lobby" || !get().isHost || game.players.length >= MAX_PLAYERS) return;
      const taken = new Set(game.players.map((p) => p.name));
      const bot = BOTS.find((b) => !taken.has(b.name)) ?? BOTS[game.players.length % BOTS.length]!;
      const id = `bot-${game.players.length}-${Math.random().toString(36).slice(2, 5)}`;
      commit(addPlayer(game, { id, name: bot.name, emoji: bot.emoji, isBot: true }));
    },
    removeBot: (id) => get().kick(id),
    kick: (id) => {
      const { isHost, game, send, dropPeer, selfId: self, mode } = get();
      if (!isHost || id === self || !game) return;
      if (id === game.hostId) return;
      if (game.phase === "lobby") {
        const player = game.players.find((p) => p.id === id);
        if (player?.isBot) {
          commit(removePlayer(game, id));
          return;
        }
        banned.add(id);
        send?.({ t: "kicked" }, id);
        dropPeer?.(id);
        if (player) commit(removePlayer(game, id));
        return;
      }
      get().proposeKick(id);
    },
    startDive: () => {
      const game = get().game;
      if (!game || !get().isHost || !canStart(game)) return;
      clearTimers();
      commit(startGame(game));
    },
    choose: (stay) => {
      const choice: Choice = stay ? "stay" : "leave";
      const { game, isHost, mode, selfId: id, send, snapshot } = get();
      if (snapshot && !snapshot.players.some((p) => p.id === id)) return;
      if (mode === "online" && !isHost) {
        send?.({ t: "choice", stay, seq: snapshot?.seq ?? 0 });
        set((s) => ({
          privateView: s.privateView ? { ...s.privateView, choice } : s.privateView,
        }));
        return;
      }
      if (game) commit(setChoice(game, id, choice));
    },
    playAgain: () => {
      const game = get().game;
      if (!game || !get().isHost) return;
      clearTimers();
      const host = game.players.find((p) => p.id === game.hostId);
      let next = createLobby({
        id: game.hostId,
        name: host?.name ?? "隊長",
        emoji: host?.emoji ?? "⚓",
        isBot: false,
      });
      next = applyHouseRules(next, game.rules);
      for (const p of game.players) {
        if (p.id === game.hostId || !p.isBot) continue;
        next = addPlayer(next, { id: p.id, name: p.name, emoji: p.emoji, isBot: true });
      }
      const { send, peers, mode } = get();
      set({ rematchSkipped: [] });
      commit(next);
      if (mode === "online" && send) {
        for (const peer of peers) {
          send({ t: "rematch-invite" }, peer.id);
        }
      }
    },
    resetHome: () => {
      clearTimers();
      banned.clear();
      set({
        screen: "landing",
        mode: "idle",
        isHost: false,
        roomCode: null,
        hostGone: false,
        kicked: false,
        game: null,
        snapshot: null,
        privateView: null,
        peers: [],
        send: null,
        dropPeer: null,
        signalCount: 0,
        reaction: null,
        kickVote: null,
        rematchInvite: false,
        rematchAccepted: false,
        rematchSkipped: [],
      });
    },
    onNetMessage: (from, data) => {
      const { isHost, game, selfId: id, send, dropPeer } = get();
      if (!data || typeof data !== "object" || !("t" in data)) return;
      const t = (data as { t?: string }).t;
      if (t === "kicked") {
        set({
          kicked: true,
          screen: "lobby",
          snapshot: null,
          game: null,
          send: null,
        });
        return;
      }
      if (t === "burst") {
        const msg = data as { t: "burst"; emoji: string; fromId: string; name: string; avatar: string };
        if (!isReaction(msg.emoji)) return;
        if (msg.fromId === get().selfId) return;
        revealBurst({
          emoji: msg.emoji,
          fromId: msg.fromId,
          name: msg.name,
          avatar: msg.avatar,
        });
        return;
      }
      if (t === "react") {
        if (!isHost) return;
        const msg = data as { t: "react"; emoji: string };
        if (!isReaction(msg.emoji)) return;
        const player = game?.players.find((p) => p.id === from) ?? game?.spectators.find((s) => s.id === from);
        const burst = {
          emoji: msg.emoji,
          fromId: from,
          name: player?.name || get().name.trim() || "潛伴",
          avatar: player?.emoji || "🤿",
        };
        revealBurst(burst);
        send?.({ t: "burst", ...burst });
        return;
      }
      if (t === "snapshot") {
        if (get().kicked) return;
        const msg = data as { t: "snapshot"; public: PublicSnapshot; private?: PrivateView };
        if (msg.public.phase === "lobby" && get().screen === "play" && !get().rematchAccepted) {
          set({ rematchInvite: true });
          return;
        }
        set({
          snapshot: msg.public,
          privateView: msg.private ?? get().privateView,
          screen: msg.public.phase === "lobby" ? "lobby" : "play",
          hostGone: false,
          rematchInvite: false,
          rematchAccepted: msg.public.phase === "lobby" ? false : get().rematchAccepted,
        });
        return;
      }
      if (t === "host-left") {
        set({ hostGone: true });
        return;
      }
      if (t === "kick-vote") {
        const msg = data as { t: "kick-vote"; targetId: string; name: string; emoji: string };
        set({
          kickVote: {
            targetId: msg.targetId,
            name: msg.name,
            emoji: msg.emoji,
            until: Date.now() + TIMING.kickVote,
          },
        });
        return;
      }
      if (t === "kick-cancel") {
        set({ kickVote: null });
        return;
      }
      if (t === "rematch-invite") {
        if (!isHost) set({ rematchInvite: true });
        return;
      }
      if (!isHost || !game) return;
      if (t === "join" || t === "hello") {
        if (banned.has(from) || from === id) {
          if (banned.has(from)) {
            send?.({ t: "kicked" }, from);
            dropPeer?.(from);
          }
          return;
        }
        const msg = data as { t: string; name?: string; emoji?: string };
        const name = t === "join" ? msg.name ?? from : from;
        const emoji = t === "join" ? msg.emoji ?? "🤿" : "🤿";
        const person = { id: from, name: name.slice(0, 12) || "潛伴", emoji };
        if (game.phase === "lobby") {
          commit(addPlayer(game, { ...person, isBot: false }));
        } else {
          commit(addSpectator(game, person));
        }
        return;
      }
      if (t === "choice") {
        const msg = data as { t: "choice"; stay: boolean };
        commit(setChoice(game, from, parseChoice(msg.stay)));
        return;
      }
      if (t === "rematch-no") {
        set({ rematchSkipped: [...get().rematchSkipped, from] });
        return;
      }
      if (t === "kick-ack") {
        const vote = get().kickVote;
        const msg = data as { t: "kick-ack"; targetId: string };
        if (!vote || vote.targetId !== msg.targetId) return;
        if (from === vote.targetId || from === id) return;
        if (!game.players.some((p) => p.id === from && !p.isBot)) return;
        applyKick(vote.targetId);
      }
    },
    onRoster: (peers) => {
      const { isHost, game, mode } = get();
      set({ peers });
      if (!isHost || !game || mode !== "online") return;
      const alive = new Set(peers.map((p) => p.id));
      let next = game;
      for (const p of game.players) {
        if (p.isBot || p.id === game.hostId) continue;
        const connected = alive.has(p.id);
        if (connected !== p.connected) {
          next = {
            ...next,
            players: next.players.map((x) => (x.id === p.id ? { ...x, connected } : x)),
          };
        }
      }
      for (const s of game.spectators) {
        const connected = alive.has(s.id);
        if (connected !== s.connected) {
          next = {
            ...next,
            spectators: next.spectators.map((x) => (x.id === s.id ? { ...x, connected } : x)),
          };
        }
      }
      if (next !== game) commit(next);
    },
    pushJoin: () => {
      const { send, name, emoji, isHost, kicked } = get();
      if (isHost || kicked) return;
      send?.({ t: "join", name: name.trim() || "潛伴", emoji });
    },
    republish: () => {
      const { game, selfId: id, send, isHost, peers } = get();
      if (!isHost || !game || !send) return;
      publish(game, id, send, true);
      if (game.phase === "lobby") {
        const seated = new Set(game.players.map((p) => p.id));
        for (const peer of peers) {
          if (seated.has(peer.id)) continue;
          send({ t: "rematch-invite" }, peer.id);
        }
      }
    },
    react: (emoji) => {
      if (!isReaction(emoji)) return;
      const { selfId: id, name, emoji: avatar, isHost, mode, send, snapshot } = get();
      const seated = snapshot?.players.find((p) => p.id === id);
      const watch = snapshot?.spectators.find((p) => p.id === id);
      const callsign = name.trim() || seated?.name || watch?.name || "潛伴";
      const burst = { emoji, fromId: id, name: callsign, avatar: avatar || seated?.emoji || watch?.emoji || "🤿" };
      revealBurst(burst);
      if (mode !== "online" || !send) return;
      if (isHost) send({ t: "burst", ...burst });
      else send({ t: "react", emoji });
    },
    setAudioReady: (ready) => {
      const was = get().audioReady;
      set({ audioReady: ready });
      if (ready && !was) {
        const game = get().game;
        if (game) drive(game);
      }
    },
    proposeKick: (id) => {
      const { isHost, game, send, dropPeer, selfId: self, mode } = get();
      if (!isHost || !game || id === self || id === game.hostId) return;
      const spec = game.spectators.find((s) => s.id === id);
      if (spec) {
        applyKick(id);
        return;
      }
      const player = game.players.find((p) => p.id === id);
      if (!player) return;
      if (player.isBot || mode !== "online") {
        applyKick(id);
        return;
      }
      const vote: KickVote = {
        targetId: id,
        name: player.name,
        emoji: player.emoji,
        until: Date.now() + TIMING.kickVote,
      };
      set({ kickVote: vote });
      send?.({ t: "kick-vote", targetId: id, name: player.name, emoji: player.emoji });
      later(TIMING.kickVote, () => {
        const current = get().kickVote;
        if (!current || current.targetId !== id || current.until !== vote.until) return;
        set({ kickVote: null });
        send?.({ t: "kick-cancel" });
      });
    },
    secondKick: () => {
      const { isHost, kickVote, send, selfId: id, snapshot } = get();
      if (isHost || !kickVote) return;
      if (id === kickVote.targetId) return;
      if (!snapshot?.players.some((p) => p.id === id)) return;
      send?.({ t: "kick-ack", targetId: kickVote.targetId });
    },
    acceptRematch: () => {
      const { isHost, send, name, emoji } = get();
      if (isHost) return;
      set({ rematchAccepted: true, rematchInvite: false });
      send?.({ t: "join", name: name.trim() || "潛伴", emoji });
    },
    declineRematch: () => {
      const { send } = get();
      send?.({ t: "rematch-no" });
      set({ rematchInvite: false, rematchAccepted: false });
    },
  };
});
