import { useEffect, useRef } from "react";
import { armAudioUnlock, audio } from "@/lib/game/audio";
import { useGameStore } from "@/lib/game/store";

export function AudioBed() {
  const screen = useGameStore((s) => s.screen);
  const snapshot = useGameStore((s) => s.snapshot);
  const last = useRef({ seq: 0, phase: "", path: 0 });

  useEffect(() => {
    armAudioUnlock();
  }, []);

  useEffect(() => {
    if (screen === "landing") return;
    void audio.preloadAll().then(() => {
      useGameStore.getState().setAudioReady(true);
    });
  }, [screen]);

  useEffect(() => {
    audio.setBgmLevel(screen === "play" ? 0.26 : 0.16);
  }, [screen]);

  useEffect(() => {
    if (!snapshot) return;
    const prev = last.current;
    if (snapshot.seq === prev.seq) return;
    last.current = { seq: snapshot.seq, phase: snapshot.phase, path: snapshot.path.length };

    if (snapshot.path.length > prev.path && snapshot.phase !== "collapsed") {
      const card = snapshot.path[snapshot.path.length - 1];
      audio.play("flip");
      if (card?.kind === "treasure") audio.play("pearl");
      else if (card?.kind === "hazard") audio.play("hazard");
      else if (card?.kind === "artifact") audio.play("artifact");
      else audio.play("bubble");
    }
    if (snapshot.phase === "collapsed" && prev.phase !== "collapsed") {
      audio.play("collapse");
      audio.setBgmLevel(0.06);
    }
    if (prev.phase === "collapsed" && snapshot.phase !== "collapsed") {
      audio.setBgmLevel(screen === "play" ? 0.26 : 0.16);
    }
    if (snapshot.phase === "revealing" && prev.phase !== "revealing") audio.play("reveal");
    if (snapshot.phase === "roundIntro" && prev.phase !== "roundIntro") audio.play("start");
  }, [snapshot, screen]);

  return null;
}
