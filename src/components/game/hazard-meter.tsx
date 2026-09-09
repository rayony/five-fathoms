import { HAZARD_ICON } from "@/components/game/card-view";
import { copy, HAZARD_LABEL, interpolate, type Locale } from "@/lib/game/i18n";
import { HAZARD_KINDS, hazardCopiesFor, type HazardKind, type HouseRules, type PathCard } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const PATH_PIPS = 2;

export function HazardMeter({
  path,
  discarded,
  locale,
  collapsing,
  rules,
}: {
  path: PathCard[];
  discarded: HazardKind[];
  locale: Locale;
  collapsing: HazardKind | null;
  rules?: HouseRules | null;
}) {
  const t = copy[locale];
  const copies = hazardCopiesFor(rules);
  const onPath = Object.fromEntries(HAZARD_KINDS.map((h) => [h, 0])) as Record<HazardKind, number>;
  for (const card of path) {
    if (card.kind === "hazard") onPath[card.hazard] += 1;
  }
  const gone = Object.fromEntries(HAZARD_KINDS.map((h) => [h, 0])) as Record<HazardKind, number>;
  for (const h of discarded) gone[h] += 1;

  return (
    <ul className="grid grid-cols-5 gap-1">
      {HAZARD_KINDS.map((kind) => {
        const Icon = HAZARD_ICON[kind];
        const armed = Math.min(PATH_PIPS, onPath[kind]);
        const removed = gone[kind];
        const left = Math.max(0, copies - Math.min(copies, onPath[kind] + removed));
        const hot = collapsing === kind || armed >= 2;
        return (
          <li
            key={kind}
            className={cn(
              "flex flex-col items-center gap-1 rounded-[12px] border px-0.5 py-1.5",
              hot ? "border-danger/50 bg-danger/15" : armed ? "border-danger/25 bg-surface" : "border-border bg-surface",
            )}
            title={`${HAZARD_LABEL[locale][kind]} · ${interpolate(t.remainCount, { n: left })} · ${t.copiesOnPath} ${armed}`}
          >
            <Icon className={cn("size-4", hot || armed ? "text-danger" : "text-muted")} strokeWidth={1.7} />
            <span
              className={cn(
                "px-0.5 text-center text-[10px] leading-tight",
                hot || armed ? "text-fg" : "text-subtle",
              )}
            >
              {interpolate(t.remainCount, { n: left })}
            </span>
            <span className="flex gap-0.5">
              {Array.from({ length: PATH_PIPS }, (_, i) => (
                <span
                  key={i}
                  className={cn("size-2 rounded-full", i < armed ? "bg-danger" : "bg-border")}
                />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
