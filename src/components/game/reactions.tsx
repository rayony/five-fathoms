import { useEffect } from "react";
import { audio } from "@/lib/game/audio";
import { copy } from "@/lib/game/i18n";
import { REACTIONS } from "@/lib/game/protocol";
import { useGameStore } from "@/lib/game/store";

export function ReactionBar() {
  const locale = useGameStore((s) => s.locale);
  const t = copy[locale];
  const react = useGameStore((s) => s.react);

  return (
    <div className="flex justify-center">
      <div
        className="flex gap-0.5 rounded-[18px] border border-border bg-surface/95 p-1"
        role="group"
        aria-label={t.reactBar}
      >
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="flex size-11 items-center justify-center rounded-[12px] text-[1.35rem] leading-none hover:bg-surface-2"
            onClick={() => react(emoji)}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReactionBurst() {
  const reaction = useGameStore((s) => s.reaction);
  useEffect(() => {
    if (reaction) audio.playReact(reaction.emoji);
  }, [reaction?.at]);
  if (!reaction) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[45] flex items-center justify-center" aria-live="polite">
      <div key={reaction.at} className="ff-burst flex flex-col items-center gap-2">
        <span className="text-7xl leading-none drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]">{reaction.emoji}</span>
        <p className="rounded-full bg-surface/90 px-3 py-1 text-sm text-fg">
          <span className="mr-1">{reaction.avatar}</span>
          {reaction.name}
        </p>
      </div>
    </div>
  );
}