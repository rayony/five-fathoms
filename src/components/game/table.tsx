import { Anchor, Eye, HelpCircle, X } from "lucide-react";
import { MuteButton } from "@/components/game/mute-button";
import { CollapseCeremony, BriefingBanner, RelicIntro, RoundHold } from "@/components/game/ceremony";
import { HazardMeter } from "@/components/game/hazard-meter";
import { KickVoteBanner } from "@/components/game/kick-vote";
import { ReactionBar } from "@/components/game/reactions";
import { Button } from "@/components/ui/button";
import { CardView, PearlPips, RelicList } from "@/components/game/card-view";
import { HouseRuleChips } from "@/components/game/house-rules";
import { copy, interpolate } from "@/lib/game/i18n";
import { leftoverOnPath } from "@/lib/game/engine";
import { audio } from "@/lib/game/audio";
import { useGameStore } from "@/lib/game/store";
import { artifactPointsForIndex, playerScore } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function Table() {
  const locale = useGameStore((s) => s.locale);
  const t = copy[locale];
  const snapshot = useGameStore((s) => s.snapshot);
  const privateView = useGameStore((s) => s.privateView);
  const selfId = useGameStore((s) => s.selfId);
  const choose = useGameStore((s) => s.choose);
  const playAgain = useGameStore((s) => s.playAgain);
  const resetHome = useGameStore((s) => s.resetHome);
  const isHost = useGameStore((s) => s.isHost);
  const setRulesOpen = useGameStore((s) => s.setRulesOpen);
  const hostGone = useGameStore((s) => s.hostGone);
  const game = useGameStore((s) => s.game);
  const audioReady = useGameStore((s) => s.audioReady);
  const mode = useGameStore((s) => s.mode);
  const roomCode = useGameStore((s) => s.roomCode);
  const kickVote = useGameStore((s) => s.kickVote);
  const rematchInvite = useGameStore((s) => s.rematchInvite);
  const proposeKick = useGameStore((s) => s.proposeKick);
  const secondKick = useGameStore((s) => s.secondKick);
  const acceptRematch = useGameStore((s) => s.acceptRematch);
  const declineRematch = useGameStore((s) => s.declineRematch);

  if (!snapshot) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-sm text-muted">{t.joining}</main>
    );
  }

  const me = snapshot.players.find((p) => p.id === selfId);
  const spectating = !me;
  const inWreck = Boolean(me?.inTemple);
  const choosing = snapshot.phase === "choosing" && inWreck && !privateView?.choice && !spectating;
  const leftover = game
    ? leftoverOnPath(game)
    : snapshot.path.reduce((s, c) => s + (c.kind === "treasure" ? c.leftover : 0), 0);
  const myTent = privateView?.tentGems ?? me?.tentGems ?? 0;
  const gameOver = snapshot.phase === "gameOver";
  const collapsed = snapshot.phase === "collapsed";
  const intro = snapshot.phase === "roundIntro";
  const holding = snapshot.phase === "roundEnd";
  const relicId = snapshot.roundArtifactId;
  const spectators = snapshot.spectators ?? [];
  const pathWorth = (() => {
    const map = new Map<string, number>();
    let next = snapshot.claimedArtifactCount;
    for (const card of snapshot.path) {
      if (card.kind !== "artifact") continue;
      map.set(card.id, artifactPointsForIndex(next));
      next += 1;
    }
    return map;
  })();
  const canKick = isHost && mode === "online" && !gameOver;
  const canSecond =
    Boolean(kickVote) &&
    !isHost &&
    !spectating &&
    kickVote?.targetId !== selfId &&
    Boolean(me);

  return (
    <main
      className={cn(
        "relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]",
        collapsed && "ff-shake",
      )}
    >
      <header className="relative z-50 mb-2 flex items-center justify-between gap-3">
        <p className="text-xs tracking-[0.18em] text-muted">
          {interpolate(t.round, { n: snapshot.round || 1 })}
          <span className="text-subtle">{t.ofFive}</span>
          {roomCode ? <span className="ml-2 tracking-normal text-subtle">{roomCode}</span> : null}
        </p>
        <div className="flex items-center gap-1">
          <MuteButton />
          <button
            type="button"
            className="flex size-10 items-center justify-center text-muted"
            onClick={() => setRulesOpen(true)}
            aria-label={t.rules}
          >
            <HelpCircle className="size-5" />
          </button>
        </div>
      </header>
      {snapshot.rules?.safeStart || snapshot.rules?.charm ? (
        <div className="relative z-30 mb-2">
          <HouseRuleChips locale={locale} rules={snapshot.rules} />
        </div>
      ) : null}
      <p className="relative z-30 mb-3 min-h-6 text-center text-sm leading-snug text-fg">
        {collapsed ? t.collapsed : snapshot.lastHeadline}
      </p>

      {!intro && !collapsed && (snapshot.lastFathomBrief || snapshot.lastActionBrief) ? (
        <div className="relative z-30 mb-3">
          <BriefingBanner
            locale={locale}
            fathom={snapshot.lastFathomBrief}
            action={snapshot.lastActionBrief}
          />
        </div>
      ) : null}

      {hostGone ? <p className="mb-3 rounded-[14px] bg-danger/15 px-3 py-2 text-sm">{t.hostLeft}</p> : null}

      {kickVote ? (
        <KickVoteBanner
          locale={locale}
          vote={kickVote}
          canSecond={canSecond}
          isHost={isHost}
          onAgree={secondKick}
        />
      ) : null}

      {spectating && !gameOver ? (
        <p className="relative z-30 mb-3 rounded-[14px] border border-border bg-surface px-3 py-2 text-center text-sm text-muted">
          {t.spectating}
        </p>
      ) : null}

      <section className="mb-3 flex gap-3 text-xs text-muted">
        <span>
          {t.leftover} <PearlPips n={leftover} />
        </span>
        <span>
          {t.deck} {snapshot.deckCount}
        </span>
      </section>

      <div className="relative z-30 mb-3">
        <p className="mb-1.5 text-[11px] tracking-wide text-subtle">{t.hazardTrack}</p>
        <HazardMeter
          path={snapshot.path}
          discarded={snapshot.discardedHazards}
          locale={locale}
          collapsing={snapshot.collapsingHazard}
          rules={snapshot.rules}
        />
      </div>

      <div className={cn("-mx-4 mb-4 overflow-x-auto px-4", collapsed && "relative z-30")}>
        <div className="flex min-h-[10rem] items-stretch gap-2 pb-2">
          {snapshot.path.length === 0 ? (
            <div className="flex h-[8.5rem] min-w-[9rem] items-center justify-center rounded-[14px] border border-dashed border-border text-xs text-subtle">
              {interpolate(t.round, { n: snapshot.round || 1 })}
            </div>
          ) : (
            snapshot.path.map((card) => (
              <CardView
                key={card.id}
                card={card}
                locale={locale}
                claimPoints={card.kind === "artifact" ? pathWorth.get(card.id) : undefined}
                hot={collapsed && card.kind === "hazard" && card.hazard === snapshot.collapsingHazard}
              />
            ))
          )}
        </div>
      </div>

      {gameOver ? (
        <section className="mt-6 rounded-[24px] border border-border bg-surface p-5">
          <h2 className="font-display text-2xl">{snapshot.winners.length > 1 ? t.tie : t.winner}</h2>
          {rematchInvite && !isHost ? (
            <p className="mt-2 text-sm text-muted">
              {t.rematchInvite}
              <span className="mt-1 block">{t.rematchBody}</span>
            </p>
          ) : null}
          <ol className="mt-4 flex flex-col gap-2">
            {[...snapshot.players]
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.artifactCount - a.artifactCount)
              .map((p) => (
                <li key={p.id} className="flex flex-col gap-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      {p.emoji} {p.name}
                      {snapshot.winners.includes(p.id) ? " ·" : ""}
                    </span>
                    <span className="tabular-nums text-pearl">
                      {p.score ??
                        (p.id === selfId
                          ? playerScore({ tentGems: myTent, artifacts: privateView?.artifacts ?? [] })
                          : 0)}
                    </span>
                  </div>
                  <RelicList
                    locale={locale}
                    artifacts={
                      p.id === selfId ? (privateView?.artifacts ?? p.artifacts ?? []) : (p.artifacts ?? [])
                    }
                  />
                </li>
              ))}
          </ol>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {isHost ? (
              <Button className="flex-1" size="lg" onClick={playAgain}>
                {mode === "online" ? t.inviteAgain : t.playAgain}
              </Button>
            ) : rematchInvite ? (
              <>
                <Button className="flex-1" size="lg" onClick={acceptRematch}>
                  {t.rematchEnter}
                </Button>
                <Button className="flex-1" size="lg" variant="secondary" onClick={declineRematch}>
                  {t.rematchSkip}
                </Button>
              </>
            ) : (
              <p className="flex-1 self-center text-center text-sm text-muted">{t.rematchWait}</p>
            )}
            <Button className="flex-1" size="lg" variant="secondary" onClick={resetHome}>
              {t.backHome}
            </Button>
          </div>
        </section>
      ) : (
        <div className="relative z-20 grid grid-cols-2 gap-3">
          <Button
            variant="leave"
            size="lg"
            disabled={!choosing}
            onClick={() => {
              audio.play("leave");
              choose(false);
            }}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              👍
            </span>
            {t.surface}
          </Button>
          <Button
            variant="stay"
            size="lg"
            disabled={!choosing}
            onClick={() => {
              audio.play("stay");
              choose(true);
            }}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              👎
            </span>
            {t.diveAgain}
          </Button>
          {spectating ? (
            <p className="col-span-2 text-center text-xs text-subtle">{t.spectating}</p>
          ) : !inWreck && !gameOver ? (
            <p className="col-span-2 text-center text-xs text-subtle">{t.inBell}</p>
          ) : null}
          {snapshot.phase === "choosing" && inWreck && privateView?.choice ? (
            <p className="col-span-2 text-center text-xs text-muted">{t.waitingChoices}</p>
          ) : null}
        </div>
      )}

      <div className="relative z-30 mt-4">
        <ReactionBar />
      </div>

      <ul className="relative z-10 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {snapshot.players.map((p) => {
          const mine = p.id === selfId;
          const revealedChoice = snapshot.phase === "choosing" ? null : p.lastChoice;
          return (
            <li
              key={p.id}
              className={cn(
                "relative overflow-hidden rounded-[18px] border px-3 py-2.5",
                mine && p.inTemple
                  ? "border-accent bg-accent/10"
                  : !p.inTemple && !gameOver
                    ? "border-pearl/45 bg-[color-mix(in_oklab,var(--color-pearl)_12%,var(--color-surface))]"
                    : p.inTemple
                      ? "border-accent/25 bg-surface"
                      : "border-border bg-bg",
              )}
            >
              {!p.inTemple && !gameOver ? (
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-pearl">
                  <Anchor className="size-3.5" strokeWidth={2} />
                  {t.surfacedStamp}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <span className="text-lg">{p.emoji}</span>
                <p className="min-w-0 truncate text-sm font-medium">
                  {p.name}
                  {mine ? <span className="ml-1 text-xs text-accent">{t.you}</span> : null}
                </p>
                {canKick && !mine ? (
                  <button
                    type="button"
                    className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-danger/15 hover:text-danger"
                    onClick={() => proposeKick(p.id)}
                    aria-label={t.kickPlayer}
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-subtle">{p.inTemple ? t.inWreck : t.inBell}</p>
              <p className="mt-1 text-xs text-muted">
                {t.thisDive} <PearlPips n={p.expeditionGems} />
              </p>
              {mine || snapshot.phase === "gameOver" ? (
                <p className="text-xs text-pearl">
                  {t.tent} {mine ? myTent : (p.tentGems ?? 0)}
                </p>
              ) : (
                <p className="text-xs text-subtle">{t.tent}</p>
              )}
              <RelicList
                locale={locale}
                artifacts={mine ? (privateView?.artifacts ?? p.artifacts ?? []) : (p.artifacts ?? [])}
              />
              {snapshot.phase === "choosing" && p.inTemple ? (
                <p className="mt-1 text-[11px] text-muted">
                  {mine && privateView?.choice
                    ? privateView.choice === "stay"
                      ? t.youChoseStay
                      : t.youChoseLeave
                    : p.hasChosen
                      ? t.decided
                      : t.thinking}
                </p>
              ) : null}
              {revealedChoice ? (
                <p className="mt-1 text-[11px] text-accent">
                  {revealedChoice === "stay" ? t.diveAgain : t.surface}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {spectators.length > 0 ? (
        <section className="relative z-10 mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] tracking-wide text-subtle">
            <Eye className="size-3.5" strokeWidth={1.8} />
            {t.spectators}
          </p>
          <ul className="flex flex-wrap gap-2">
            {spectators.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm"
              >
                <span>{s.emoji}</span>
                <span className="max-w-[8rem] truncate">{s.name}</span>
                {s.id === selfId ? <span className="text-xs text-accent">{t.you}</span> : null}
                {canKick && s.id !== selfId ? (
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center text-muted hover:text-danger"
                    onClick={() => proposeKick(s.id)}
                    aria-label={t.kickPlayer}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {intro && relicId !== null && relicId !== undefined ? (
        <RelicIntro
          locale={locale}
          round={snapshot.round}
          relicId={relicId}
          lastFathomBrief={snapshot.lastFathomBrief}
          claimedCount={snapshot.claimedArtifactCount}
        />
      ) : null}
      {collapsed ? (
        <CollapseCeremony
          locale={locale}
          round={snapshot.round}
          hazard={snapshot.collapsingHazard}
          path={snapshot.path}
          players={snapshot.players}
        />
      ) : null}
      {holding ? (
        <RoundHold locale={locale} round={snapshot.round} reason={snapshot.roundEndReason} />
      ) : null}

      {!audioReady ? (
        <div
          className="absolute inset-0 z-[55] flex items-center justify-center bg-[color-mix(in_oklab,var(--color-bg)_78%,transparent)] px-4"
          role="status"
          aria-label={t.audioLoading}
        >
          <section className="w-full max-w-sm rounded-[24px] border border-border bg-surface p-5">
            <p className="text-center font-display text-2xl">{t.audioLoading}</p>
            <p className="mt-2 text-center text-sm text-muted">{t.audioLoadingHint}</p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
