import { Music2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { audio } from "@/lib/game/audio";
import { copy } from "@/lib/game/i18n";
import { useGameStore } from "@/lib/game/store";

export function MuteButton() {
  const locale = useGameStore((s) => s.locale);
  const t = copy[locale];
  const [bgmMuted, setBgmMuted] = useState(audio.bgmMuted);
  const [sfxMuted, setSfxMuted] = useState(audio.sfxMuted);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      audio.subscribe(() => {
        setBgmMuted(audio.bgmMuted);
        setSfxMuted(audio.sfxMuted);
      }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  const both = bgmMuted && sfxMuted;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-[12px] text-muted hover:text-fg"
        onClick={() => setOpen((v) => !v)}
        aria-label={both ? t.soundOn : t.soundOff}
        aria-expanded={open}
      >
        {both ? <VolumeX className="size-5" strokeWidth={1.6} /> : <Volume2 className="size-5" strokeWidth={1.6} />}
      </button>
      {open ? (
        <div className="absolute right-0 z-[60] mt-1 w-44 rounded-[16px] border border-border bg-surface p-2 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
          <button
            type="button"
            className="flex h-11 w-full items-center justify-between rounded-[12px] px-2 text-sm hover:bg-surface-2"
            onClick={() => audio.setBgmMuted(!bgmMuted)}
          >
            <span className="flex items-center gap-2">
              <Music2 className="size-4 text-muted" strokeWidth={1.7} />
              {t.muteBgm}
            </span>
            <span className={bgmMuted ? "text-subtle" : "text-accent"}>{bgmMuted ? t.off : t.on}</span>
          </button>
          <button
            type="button"
            className="flex h-11 w-full items-center justify-between rounded-[12px] px-2 text-sm hover:bg-surface-2"
            onClick={() => audio.setSfxMuted(!sfxMuted)}
          >
            <span className="flex items-center gap-2">
              <Volume2 className="size-4 text-muted" strokeWidth={1.7} />
              {t.muteSfx}
            </span>
            <span className={sfxMuted ? "text-subtle" : "text-accent"}>{sfxMuted ? t.off : t.on}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
