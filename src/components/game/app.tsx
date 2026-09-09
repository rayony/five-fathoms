import { AudioBed } from "@/components/game/audio-bed";
import { Landing } from "@/components/game/landing";
import { Lobby } from "@/components/game/lobby";
import { NetBridge } from "@/components/game/net-bridge";
import { ReactionBurst } from "@/components/game/reactions";
import { RulesSheet } from "@/components/game/rules-sheet";
import { Table } from "@/components/game/table";
import { useGameStore } from "@/lib/game/store";

export function GameApp({ pendingCode }: { pendingCode?: string }) {
  const screen = useGameStore((s) => s.screen);
  const mode = useGameStore((s) => s.mode);
  const roomCode = useGameStore((s) => s.roomCode);
  const kicked = useGameStore((s) => s.kicked);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <AudioBed />
      {mode === "online" && roomCode && !kicked ? <NetBridge key={roomCode} code={roomCode} /> : null}
      {screen === "landing" ? <Landing pendingCode={pendingCode} /> : null}
      {screen === "lobby" ? <Lobby /> : null}
      {screen === "play" ? <Table /> : null}
      {screen === "lobby" || screen === "play" ? <ReactionBurst /> : null}
      <RulesSheet />
    </div>
  );
}
