import { copy, type Locale } from "@/lib/game/i18n";
import type { HouseRules } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function HouseRuleToggles({
  locale,
  rules,
  disabled,
  onToggle,
}: {
  locale: Locale;
  rules: HouseRules;
  disabled?: boolean;
  onToggle?: (key: keyof HouseRules) => void;
}) {
  const t = copy[locale];
  const items: { key: keyof HouseRules; label: string; hint: string }[] = [
    { key: "safeStart", label: t.safeStart, hint: t.safeStartHint },
    { key: "charm", label: t.charm, hint: t.charmHint },
  ];
  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted">{t.houseRules}</p>
      {items.map((item) => {
        const on = rules[item.key];
        return (
          <button
            key={item.key}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onToggle?.(item.key)}
            className={cn(
              "flex min-h-11 w-full items-start gap-3 rounded-[16px] border px-3 py-3 text-left",
              on ? "border-accent bg-accent/10" : "border-border bg-surface",
              disabled && "cursor-default",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border text-[11px]",
                on ? "border-accent bg-accent text-accent-fg" : "border-border text-transparent",
              )}
              aria-hidden="true"
            >
              ✓
            </span>
            <span>
              <span className="block text-sm font-medium text-fg">{item.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-subtle">{item.hint}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

export function HouseRuleChips({ locale, rules }: { locale: Locale; rules: HouseRules }) {
  const t = copy[locale];
  const chips = [
    rules.safeStart ? t.safeStart : null,
    rules.charm ? t.charm : null,
  ].filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <p className="text-[11px] leading-snug text-accent">
      {t.houseRules} · {chips.join(" · ")}
    </p>
  );
}
