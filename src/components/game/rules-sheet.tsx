import { BrickWall, Droplets, Fish, Gem, Waves, Wind, X } from "lucide-react";
import { copy, HAZARD_LABEL, RULES_BODY } from "@/lib/game/i18n";
import { useGameStore } from "@/lib/game/store";
import { HAZARD_COPIES, HAZARD_KINDS, TREASURE_VALUES } from "@/lib/game/types";

const HAZARD_ICON = {
  shark: Fish,
  jellyfish: Droplets,
  current: Wind,
  collapse: BrickWall,
  blackwater: Waves,
} as const;

const PEARL_LIST = TREASURE_VALUES.join(" · ");

export function RulesSheet() {
  const open = useGameStore((s) => s.rulesOpen);
  const setOpen = useGameStore((s) => s.setRulesOpen);
  const locale = useGameStore((s) => s.locale);
  const t = copy[locale];
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="rules-title"
        className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-border bg-surface p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="rules-title" className="font-display text-2xl">
            {t.rulesTitle}
          </h2>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-[12px] text-muted"
            onClick={() => setOpen(false)}
            aria-label={t.close}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-[18px] border border-border bg-bg p-4">
            <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted">
              <Gem className="size-3.5 text-pearl" strokeWidth={1.75} />
              {t.deckPearls}
            </p>
            <p className="mt-2 font-display text-2xl tabular-nums text-pearl">
              {TREASURE_VALUES[0]}–{TREASURE_VALUES[TREASURE_VALUES.length - 1]}
            </p>
            <p className="mt-1 text-xs text-subtle">{t.deckPearlRange}</p>
            <p className="mt-3 text-[11px] leading-relaxed tabular-nums text-muted">{PEARL_LIST}</p>
          </section>
          <section className="rounded-[18px] border border-border bg-bg p-4">
            <p className="text-xs font-medium tracking-wide text-muted">{t.deckHazards}</p>
            <p className="mt-2 font-display text-2xl text-fg">{t.deckHazardCount}</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {HAZARD_KINDS.map((kind) => {
                const Icon = HAZARD_ICON[kind];
                return (
                  <li key={kind} className="flex items-center gap-2 text-sm text-fg">
                    <Icon className="size-4 text-danger" strokeWidth={1.7} />
                    <span>{HAZARD_LABEL[locale][kind]}</span>
                    <span className="ml-auto tabular-nums text-xs text-subtle">×{HAZARD_COPIES}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted">{t.blackwaterNote}</p>
          </section>
        </div>

        <ol className="flex flex-col gap-4 text-sm leading-relaxed text-muted">
          {RULES_BODY[locale].map((para) => (
            <li key={para}>{para}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
