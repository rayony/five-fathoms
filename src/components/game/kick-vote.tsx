import { HoldBar } from "@/components/game/ceremony";
import { Button } from "@/components/ui/button";
import { copy, interpolate, type Locale } from "@/lib/game/i18n";
import { TIMING } from "@/lib/game/timing";
import type { KickVote } from "@/lib/game/store";

export function KickVoteBanner({
  locale,
  vote,
  canSecond,
  isHost,
  onAgree,
}: {
  locale: Locale;
  vote: KickVote;
  canSecond: boolean;
  isHost: boolean;
  onAgree: () => void;
}) {
  const t = copy[locale];
  return (
    <div
      className="relative z-50 mb-3 rounded-[18px] border border-danger/40 bg-surface p-3"
      role="dialog"
      aria-label={interpolate(t.kickVote, { name: vote.name })}
    >
      <p className="text-center text-sm font-medium">
        {interpolate(t.kickVote, { name: `${vote.emoji} ${vote.name}` })}
      </p>
      <p className="mt-1 text-center text-xs text-muted">{t.kickNeedSecond}</p>
      {canSecond ? (
        <Button className="mt-3 w-full" variant="danger" size="sm" onClick={onAgree}>
          {t.kickAgree}
        </Button>
      ) : (
        <p className="mt-2 text-center text-xs text-subtle">{isHost ? t.kickWaiting : t.kickNeedSecond}</p>
      )}
      <HoldBar
        danger
        stamp={`kick-${vote.targetId}-${vote.until}`}
        duration={TIMING.kickVote}
        label={t.kickWaiting}
      />
    </div>
  );
}
