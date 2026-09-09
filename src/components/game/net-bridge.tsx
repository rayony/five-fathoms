import { useEffect } from "react";
import { useP2PRoom } from "@/lib/multiplayer";
import { guestSignalingName, hostSignalingName } from "@/lib/multiplayer/p2p";
import { roomIdForCode } from "@/lib/game/protocol";
import { useGameStore } from "@/lib/game/store";

export function NetBridge({ code }: { code: string }) {
  const name = useGameStore((s) => s.name);
  const emoji = useGameStore((s) => s.emoji);
  const selfId = useGameStore((s) => s.selfId);
  const isHost = useGameStore((s) => s.isHost);
  const label = `${emoji}${name || "diver"}`;
  const p2p = useP2PRoom({
    room: roomIdForCode(code),
    name: isHost ? hostSignalingName(label) : guestSignalingName(label),
    selfId,
    isHost,
  });

  useEffect(() => {
    useGameStore.getState().setSend(p2p.send);
    return () => {
      useGameStore.getState().setSend(null);
    };
  }, [p2p.send]);

  useEffect(() => {
    useGameStore.getState().setDropPeer(p2p.drop);
    return () => {
      useGameStore.getState().setDropPeer(null);
    };
  }, [p2p.drop]);

  useEffect(() => {
    return p2p.onMessage((from, data, channel) => {
      if (channel !== "reliable") return;
      useGameStore.getState().onNetMessage(from, data);
    });
  }, [p2p.onMessage]);

  useEffect(() => {
    useGameStore.getState().onRoster(p2p.peers);
  }, [p2p.peers]);

  useEffect(() => {
    useGameStore.getState().setSignalCount(p2p.signalCount);
  }, [p2p.signalCount]);

  useEffect(() => {
    if (!p2p.joined) return;
    const tick = () => {
      const s = useGameStore.getState();
      if (s.isHost) {
        s.republish();
        return;
      }
      if (s.rematchAccepted) {
        s.pushJoin();
        return;
      }
      if (s.snapshot && s.snapshot.phase !== "lobby") return;
      const mine = s.snapshot?.players.find((p) => p.id === s.selfId);
      const callsign = s.name.trim() || "潛伴";
      if (mine && mine.name === callsign && mine.emoji === s.emoji) return;
      s.pushJoin();
    };
    tick();
    const id = window.setInterval(tick, 1200);
    return () => window.clearInterval(id);
  }, [p2p.joined, p2p.peers, p2p.channelGen, name, emoji]);

  return null;
}
