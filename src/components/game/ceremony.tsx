import { useEffect, useState } from "react";
import { CardView, HAZARD_ICON } from "@/components/game/card-view";
import { copy, HAZARD_LABEL, interpolate, type Locale } from "@/lib/game/i18n";
import { TIMING } from "@/lib/game/timing";
import type {
  ActionBrief,
  ArtifactId,
  FathomBrief,
  HazardKind,
  PathCard,
  PublicPlayer,
} from "@/lib/game/types";
import { artifactPointsForIndex } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function HoldBar({
  stamp,
  duration,
  label,
  danger,
}: {
  stamp: string;
  duration: number;
  label: string;
  danger?: boolean;
}) {
  const [left, setLeft] = useState(1);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setLeft(Math.max(0, 1 - (now - start) / duration));
      if (now - start < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stamp, duration]);

  return (
    <div className="mt-4">
      <p className="mb-2 text-center text-xs tracking-wide text-muted">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full origin-left rounded-full", danger ? "bg-danger" : "bg-accent")}
          style={{ width: `${left * 100}%` }}
        />
      </div>
    </div>
  );
}

function Silt() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className="ff-silt-speck"
          style={{
            left: `${(i * 17 + 8) % 96}%`,
            animationDelay: `${(i % 7) * 0.22}s`,
            animationDuration: `${3.4 + (i % 5) * 0.55}s`,
            width: `${4 + (i % 4) * 2}px`,
            height: `${4 + (i % 3) * 2}px`,
            opacity: 0.18 + (i % 4) * 0.08,
          }}
        />
      ))}
    </div>
  );
}

export function BriefingBanner({
  locale,
  fathom,
  action,
}: {
  locale: Locale;
  fathom: FathomBrief | null;
  action: ActionBrief | null;
}) {
  const t = copy[locale];
  const showFathom = Boolean(fathom?.reason);
  const showAction = Boolean(action);
  if (!showFathom && !showAction) return null;
  const lost = fathom?.perished ?? [];
  const actionNames = action?.surfaced ?? [];
  return (
    <div className="rounded-[14px] border border-pearl/35 bg-pearl/10 px-3 py-2">
      {showFathom && fathom ? (
        <>
          <p className="text-center text-sm leading-snug text-fg">
            {fathom.reason === "hazard"
              ? interpolate(t.lastFathomHazard, {
                  name: fathom.hazard ? HAZARD_LABEL[locale][fathom.hazard] : "",
                })
              : t.lastFathomAllLeft}
          </p>
          {fathom.reason === "hazard" && lost.length > 0 ? (
            <p className="mt-1 text-center text-sm text-fg">
              {interpolate(t.lastFathomLost, {
                names: lost.map((p) => `${p.emoji} ${p.name}`).join(" · "),
              })}
            </p>
          ) : null}
        </>
      ) : null}
      {showAction ? (
        <p className={cn("text-center text-[11px] tracking-wide text-pearl", showFathom && "mt-2")}>
          {action!.surfaced.length ? t.thisFathomSurface : t.nobodySurfaced}
        </p>
      ) : null}
      {actionNames.length > 0 ? (
        <p className="mt-1 text-center text-sm text-fg">
          {actionNames.map((p) => `${p.emoji} ${p.name}`).join(" · ")}
        </p>
      ) : null}
      {action && action.surfaced.length > 0 ? (
        <p className="mt-1 text-center text-xs text-muted">
          {interpolate(t.lastActionShare, { n: action.leftoverShare })}
          {action.relics ? ` · ${t.artifact} ${action.relics}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function RelicIntro({
  locale,
  round,
  relicId,
  lastFathomBrief,
  claimedCount,
}: {
  locale: Locale;
  round: number;
  relicId: ArtifactId;
  lastFathomBrief: FathomBrief | null;
  claimedCount: number;
}) {
  const t = copy[locale];
  const worth = artifactPointsForIndex(claimedCount);
  return (
    <div
      className="ff-ceremony-in pointer-events-none fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[color-mix(in_oklab,var(--color-bg)_72%,transparent)] px-4 pb-6 pt-[max(4.25rem,env(safe-area-inset-top))] sm:items-center sm:pt-8"
      role="dialog"
      aria-label={t.relicThisFathom}
    >
      <section className="w-full max-w-sm rounded-[24px] border border-accent/40 bg-surface p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <p className="text-center text-xs tracking-[0.2em] text-muted">{interpolate(t.round, { n: round })}</p>
        <p className="mt-2 text-center font-display text-2xl leading-tight">{t.relicThisFathom}</p>
        <p className="mt-1 text-center text-sm text-muted">{t.relicPrompt}</p>
        <div className="mt-4 flex justify-center">
          <CardView
            compact
            locale={locale}
            claimPoints={worth}
            card={{ id: "intro-relic", kind: "artifact", artifactId: relicId }}
          />
        </div>
        {lastFathomBrief ? (
          <div className="mt-4">
            <BriefingBanner locale={locale} fathom={lastFathomBrief} action={null} />
          </div>
        ) : null}
        <HoldBar stamp={`intro-${round}`} duration={TIMING.roundIntro} label={t.fathomBegins} />
      </section>
    </div>
  );
}

export function CollapseCeremony({
  locale,
  round,
  hazard,
  path,
  players,
}: {
  locale: Locale;
  round: number;
  hazard: HazardKind | null;
  path: PathCard[];
  players: PublicPlayer[];
}) {
  const t = copy[locale];
  const Icon = hazard ? HAZARD_ICON[hazard] : null;
  const twins = path.filter((c) => c.kind === "hazard" && c.hazard === hazard);
  const trapped = players.filter((p) => p.lastChoice !== "leave");

  return (
    <div
      className="ff-ceremony-in pointer-events-none fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[color-mix(in_oklab,var(--color-bg)_58%,transparent)] px-4 pb-6 pt-[max(4.25rem,env(safe-area-inset-top))] sm:items-center sm:pt-8"
      role="dialog"
      aria-label={t.collapsed}
    >
      <div className="ff-collapse-veil absolute inset-0" />
      <Silt />
      <section className="relative mb-2 w-full max-w-sm rounded-[24px] border border-danger/45 bg-surface p-5 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
        <p className="text-center text-xs tracking-[0.2em] text-danger">{interpolate(t.round, { n: round })}</p>
        <p className="mt-2 text-center font-display text-[1.85rem] leading-[1.05] text-fg">{t.collapsed}</p>
        <p className="mt-2 text-center text-sm leading-relaxed text-muted">{t.collapseBody}</p>
        {hazard && Icon ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-danger">
            <Icon className="size-5" strokeWidth={1.7} />
            <span className="font-medium">{HAZARD_LABEL[locale][hazard]}</span>
          </div>
        ) : null}
        {twins.length > 0 ? (
          <div className="mt-4 flex justify-center gap-2">
            {twins.map((card) => (
              <CardView key={card.id} compact hot locale={locale} card={card} />
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-center text-sm text-fg">{t.haulLost}</p>
        {trapped.length > 0 ? (
          <p className="mt-2 text-center text-xs text-muted">
            {t.trappedCrew}
            <span className="ml-1 text-fg">
              {trapped.map((p) => `${p.emoji} ${p.name}`).join(" · ")}
            </span>
          </p>
        ) : null}
        <HoldBar
          danger
          stamp={`collapse-${round}-${hazard ?? ""}`}
          duration={TIMING.collapsed}
          label={round >= 5 ? t.winner : t.holdNext}
        />
      </section>
    </div>
  );
}

export function RoundHold({
  locale,
  round,
  reason,
}: {
  locale: Locale;
  round: number;
  reason: string | null;
}) {
  const t = copy[locale];
  const last = round >= 5;
  return (
    <div
      className="ff-ceremony-in pointer-events-none fixed inset-x-0 bottom-0 z-[60] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      role="status"
      aria-label={last ? t.winner : t.nextFathom}
    >
      <section className="mx-auto w-full max-w-sm rounded-[24px] border border-border bg-surface/95 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.4)] backdrop-blur-sm">
        <p className="text-center font-display text-xl">{last ? t.winner : t.nextFathom}</p>
        <p className="mt-1 text-center text-sm text-muted">{reason === "all-left" ? t.holdSurface : t.holdNext}</p>
        <HoldBar stamp={`end-${round}`} duration={TIMING.roundEnd} label={last ? t.winner : t.holdNext} />
      </section>
    </div>
  );
}
