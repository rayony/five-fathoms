import { useCallback, useEffect, useRef, useState } from "react";
import { P2PRoom, defaultIceServers, type PeerInfo } from "./p2p";

export interface UseP2PRoomOptions {
  room: string;
  name?: string;
  selfId?: string;
  isHost?: boolean;
}

export interface P2PRoomHandle {
  selfId: string;
  room: string;
  peers: PeerInfo[];
  joined: boolean;
  channelGen: number;
  signalCount: number;
  broadcast: (data: unknown) => void;
  send: (data: unknown, peerId?: string) => void;
  drop: (peerId: string) => void;
  onMessage: (
    fn: (from: string, data: unknown, channel: "state" | "reliable") => void,
  ) => () => void;
}

async function loadIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch("/api/ice", { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return defaultIceServers();
    const body = (await res.json()) as { iceServers?: RTCIceServer[] };
    if (Array.isArray(body.iceServers) && body.iceServers.length > 0) return body.iceServers;
  } catch {
    /* STUN only */
  }
  return defaultIceServers();
}

export function useP2PRoom(options: UseP2PRoomOptions): P2PRoomHandle {
  const [selfId] = useState(
    () => options.selfId ?? `p-${Math.random().toString(36).slice(2, 10)}`,
  );
  const [room] = useState(() => options.room);
  const [name] = useState(() => options.name ?? selfId);
  const [isHost] = useState(() => Boolean(options.isHost));
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [joined, setJoined] = useState(false);
  const [channelGen, setChannelGen] = useState(0);
  const [signalCount, setSignalCount] = useState(0);
  const roomRef = useRef<P2PRoom | null>(null);
  const listeners = useRef(
    new Set<(from: string, data: unknown, channel: "state" | "reliable") => void>(),
  );

  useEffect(() => {
    let cancelled = false;
    let p2p: P2PRoom | null = null;
    void (async () => {
      const iceServers = await loadIceServers();
      if (cancelled) return;
      p2p = new P2PRoom({
        room,
        selfId,
        name,
        isHost,
        iceServers,
        onPeersChanged: setPeers,
        onMessage: (from, data, channel) => {
          for (const fn of listeners.current) fn(from, data, channel);
        },
        onConnected: () => setJoined(true),
        onChannelOpen: () => setChannelGen((n) => n + 1),
        onSignalingRoster: (list) => setSignalCount(list.length),
      });
      roomRef.current = p2p;
      void p2p.join();
    })();
    return () => {
      cancelled = true;
      roomRef.current = null;
      p2p?.close();
    };
  }, [room, selfId, name, isHost]);

  const broadcast = useCallback((data: unknown) => roomRef.current?.broadcast(data), []);
  const send = useCallback(
    (data: unknown, peerId?: string) => roomRef.current?.send(data, peerId),
    [],
  );
  const drop = useCallback((peerId: string) => roomRef.current?.block(peerId), []);
  const onMessage = useCallback(
    (fn: (from: string, data: unknown, channel: "state" | "reliable") => void) => {
      listeners.current.add(fn);
      return () => {
        listeners.current.delete(fn);
      };
    },
    [],
  );

  return { selfId, room, peers, joined, channelGen, signalCount, broadcast, send, drop, onMessage };
}
