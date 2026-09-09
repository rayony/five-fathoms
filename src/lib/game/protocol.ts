import type { Choice, PrivateView, PublicSnapshot } from "./types";

export const REACTIONS = ["👎🏼", "👍🏼", "🫡", "💥", "💩", "🥹"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export function isReaction(value: string): value is ReactionEmoji {
  return (REACTIONS as readonly string[]).includes(value);
}

export type ClientMsg =
  | { t: "join"; name: string; emoji: string }
  | { t: "choice"; stay: boolean; seq: number }
  | { t: "hello" }
  | { t: "react"; emoji: ReactionEmoji }
  | { t: "kick-ack"; targetId: string }
  | { t: "rematch-yes" }
  | { t: "rematch-no" };

export type HostMsg =
  | { t: "snapshot"; public: PublicSnapshot; private?: PrivateView }
  | { t: "host-left" }
  | { t: "burst"; emoji: ReactionEmoji; fromId: string; name: string; avatar: string }
  | { t: "kicked" }
  | { t: "kick-vote"; targetId: string; name: string; emoji: string }
  | { t: "kick-cancel" }
  | { t: "rematch-invite" };

export function isClientMsg(data: unknown): data is ClientMsg {
  if (!data || typeof data !== "object" || !("t" in data)) return false;
  const t = (data as { t: unknown }).t;
  return t === "join" || t === "choice" || t === "hello" || t === "react" || t === "kick-ack" || t === "rematch-yes" || t === "rematch-no";
}

export function isHostMsg(data: unknown): data is HostMsg {
  if (!data || typeof data !== "object" || !("t" in data)) return false;
  const t = (data as { t: unknown }).t;
  return (
    t === "snapshot" ||
    t === "host-left" ||
    t === "burst" ||
    t === "kicked" ||
    t === "kick-vote" ||
    t === "kick-cancel" ||
    t === "rematch-invite"
  );
}

export function roomIdForCode(code: string): string {
  return `ff${code.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`;
}

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomRoomCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function parseChoice(stay: boolean): Choice {
  return stay ? "stay" : "leave";
}
