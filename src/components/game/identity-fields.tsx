import { AVATAR_EMOJIS } from "@/lib/game/types";
import { copy } from "@/lib/game/i18n";
import { useGameStore } from "@/lib/game/store";
import { cn } from "@/lib/utils";

export function IdentityFields({
  idPrefix = "diver",
  tone = "card",
  autoFocus = false,
}: {
  idPrefix?: string;
  tone?: "page" | "card";
  autoFocus?: boolean;
}) {
  const locale = useGameStore((s) => s.locale);
  const name = useGameStore((s) => s.name);
  const emoji = useGameStore((s) => s.emoji);
  const setName = useGameStore((s) => s.setName);
  const setEmoji = useGameStore((s) => s.setEmoji);
  const t = copy[locale];

  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-muted" htmlFor={`${idPrefix}-name`}>
        {t.yourName}
      </label>
      <input
        id={`${idPrefix}-name`}
        value={name}
        maxLength={12}
        placeholder={t.namePlaceholder}
        onChange={(e) => setName(e.target.value)}
        className={cn(
          "mb-5 h-12 w-full rounded-[16px] border border-border px-4 text-base text-fg outline-none placeholder:text-subtle focus:ring-2 focus:ring-accent/50",
          tone === "page" ? "bg-surface" : "bg-bg",
        )}
        autoComplete="nickname"
        autoFocus={autoFocus}
        enterKeyHint="done"
      />
      <p className="mb-2 text-xs font-medium text-muted">{t.avatar}</p>
      <div className="grid grid-cols-8 gap-1.5">
        {AVATAR_EMOJIS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setEmoji(item)}
            className={cn(
              "flex aspect-square w-full min-h-10 items-center justify-center rounded-[12px] text-xl",
              emoji === item ? "bg-surface-2 ring-1 ring-accent" : "hover:bg-surface",
            )}
            aria-label={item}
            aria-pressed={emoji === item}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
