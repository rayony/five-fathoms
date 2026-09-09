import { BrickWall, Compass, Crown, Droplets, Fish, Gem, Scroll, Wind, Waves } from "lucide-react";
import { ARTIFACT_LABEL, HAZARD_LABEL, copy, interpolate, type Locale } from "@/lib/game/i18n";
import type { ClaimedArtifact, PathCard } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export const PEARL_EMOJI = "🦪";

export const HAZARD_ICON = {
  shark: Fish,
  jellyfish: Droplets,
  current: Wind,
  collapse: BrickWall,
  blackwater: Waves,
} as const;

const ARTIFACT_ICON = [Compass, Crown, Gem, Scroll, Compass] as const;

export function CardView({
  card,
  locale,
  compact,
  hot,
  claimPoints,
}: {
  card: PathCard;
  locale: Locale;
  compact?: boolean;
  hot?: boolean;
  claimPoints?: number;
}) {
  const size = compact ? "h-[7.25rem] w-[5.1rem]" : "h-[8.5rem] w-[6rem] sm:h-[9.5rem] sm:w-[6.75rem]";

  if (card.kind === "treasure") {
    const t = copy[locale];
    return (
      <article
        className={cn(
          size,
          "relative flex flex-col justify-between rounded-[14px] border border-border bg-surface-2 p-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.28)]",
        )}
      >
        <p className="text-[10px] font-medium tracking-wide text-muted">
          {PEARL_EMOJI} {t.deckPearls}
        </p>
        <p className="font-display text-3xl tabular-nums text-pearl">
          <span className="mr-1 text-[1.35rem]">{PEARL_EMOJI}</span>
          {card.value}
        </p>
        <p className="text-[11px] tabular-nums text-subtle">
          {card.leftover > 0 ? `${t.leftover} ${card.leftover}` : t.leftoverGone}
        </p>
      </article>
    );
  }

  if (card.kind === "hazard") {
    const Icon = HAZARD_ICON[card.hazard];
    return (
      <article
        className={cn(
          size,
          "relative flex flex-col items-center justify-center gap-2 rounded-[14px] border border-danger/35 bg-[color-mix(in_oklab,var(--color-danger)_12%,var(--color-surface))] p-2.5",
          hot && "ff-card-hot border-danger bg-[color-mix(in_oklab,var(--color-danger)_22%,var(--color-surface))]",
        )}
      >
        <Icon className="size-7 text-danger" strokeWidth={1.6} />
        <p className="text-center text-sm font-medium text-fg">{HAZARD_LABEL[locale][card.hazard]}</p>
      </article>
    );
  }

  const Icon = ARTIFACT_ICON[card.artifactId] ?? Gem;
  const t = copy[locale];
  return (
    <article
      className={cn(
        size,
        "relative flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-accent/40 bg-[color-mix(in_oklab,var(--color-accent)_10%,var(--color-surface))] p-2.5",
      )}
    >
      <Icon className="size-6 text-accent" strokeWidth={1.6} />
      <p className="text-center text-[12px] font-medium leading-tight text-fg">
        {ARTIFACT_LABEL[locale][card.artifactId]}
      </p>
      {claimPoints != null ? (
        <p className="text-center text-[11px] tabular-nums text-pearl">
          {interpolate(t.relicWorth, { n: claimPoints })}
        </p>
      ) : null}
    </article>
  );
}

export function PearlPips({ n, muted }: { n: number; muted?: boolean }) {
  return (
    <span className={cn("inline-flex items-baseline gap-0.5 tabular-nums", muted ? "text-muted" : "text-pearl")}>
      <span aria-hidden="true">{PEARL_EMOJI}</span>
      <span className="font-medium">{n}</span>
    </span>
  );
}

export function RelicList({
  artifacts,
  locale,
}: {
  artifacts: ClaimedArtifact[];
  locale: Locale;
}) {
  if (artifacts.length === 0) return null;
  const t = copy[locale];
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {artifacts.map((a, i) => (
        <li key={`${a.artifactId}-${i}`} className="text-[11px] leading-snug text-accent">
          {interpolate(t.relicClaimed, { name: ARTIFACT_LABEL[locale][a.artifactId], n: a.points })}
        </li>
      ))}
    </ul>
  );
}
