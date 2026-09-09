import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Plus, QrCode, X } from "lucide-react";
import { IdentityFields } from "@/components/game/identity-fields";
import { MuteButton } from "@/components/game/mute-button";
import { ReactionBar } from "@/components/game/reactions";
import { HouseRuleToggles } from "@/components/game/house-rules";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/game/i18n";
import { audio } from "@/lib/game/audio";
import { makeQrSvg } from "@/lib/game/qr";
import { useGameStore } from "@/lib/game/store";
import { DEFAULT_HOUSE_RULES, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function Lobby() {
  const locale = useGameStore((s) => s.locale);
  const t = copy[locale];
  const isHost = useGameStore((s) => s.isHost);
  const selfId = useGameStore((s) => s.selfId);
  const selfName = useGameStore((s) => s.name);
  const selfEmoji = useGameStore((s) => s.emoji);
  const roomCode = useGameStore((s) => s.roomCode);
  const snapshot = useGameStore((s) => s.snapshot);
  const peers = useGameStore((s) => s.peers);
  const signalCount = useGameStore((s) => s.signalCount);
  const addBot = useGameStore((s) => s.addBot);
  const kick = useGameStore((s) => s.kick);
  const startDive = useGameStore((s) => s.startDive);
  const setHouseRules = useGameStore((s) => s.setHouseRules);
  const resetHome = useGameStore((s) => s.resetHome);
  const hostGone = useGameStore((s) => s.hostGone);
  const kicked = useGameStore((s) => s.kicked);
  const rematchSkipped = useGameStore((s) => s.rematchSkipped);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined" || !roomCode) return "";
    const url = new URL(window.location.href);
    url.search = `r=${roomCode}`;
    url.hash = "";
    return url.toString();
  }, [roomCode]);

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    void makeQrSvg(joinUrl).then((svg) => {
      if (!cancelled) setQr(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const copyJoinLink = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  const players = snapshot?.players ?? [];
  const canGo = players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS;
  const pending = isHost
    ? peers.filter((peer) => !players.some((p) => p.id === peer.id) && !rematchSkipped.includes(peer.id))
    : [];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="mb-6 flex items-center justify-between">
        <button type="button" className="text-sm text-muted" onClick={resetHome}>
          {t.backHome}
        </button>
        <div className="flex items-center gap-1">
          <p className="text-xs tracking-[0.18em] text-muted">{t.lobby}</p>
          <MuteButton />
        </div>
      </div>

      {kicked ? (
        <div className="rounded-[18px] border border-danger/30 bg-danger/10 px-4 py-5">
          <p className="text-sm font-medium">{t.kicked}</p>
          <p className="mt-2 text-xs text-subtle">{t.kickedHint}</p>
          <Button className="mt-5 w-full" onClick={resetHome}>
            {t.backHome}
          </Button>
        </div>
      ) : null}

      {hostGone && !kicked ? (
        <p className="mb-4 rounded-[16px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm">{t.hostLeft}</p>
      ) : null}

      {!kicked ? (
        <>
      {roomCode ? (
        <section className="mb-6 rounded-[28px] border border-border bg-surface p-5">
          <p className="text-xs text-muted">{t.roomCode}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="font-mono text-3xl tracking-[0.28em] text-fg">{roomCode}</p>
            <Button variant="secondary" size="icon" onClick={() => void copyJoinLink()} aria-label={t.copyCode}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          {copied ? <p className="mt-1 text-xs text-accent">{t.copied}</p> : null}
          {isHost && qr ? (
            <div className="mt-5 flex flex-col items-center gap-3">
              <button
                type="button"
                className="w-[188px] rounded-[20px] bg-pearl p-3 text-bg"
                onClick={() => void copyJoinLink()}
                aria-label={t.copyCode}
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <p className="flex items-center gap-1.5 text-xs text-subtle">
                <QrCode className="size-3.5" />
                {copied ? t.copied : t.qrHint}
              </p>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="mb-6 text-sm text-muted">{t.practiceHint}</p>
      )}

      <section className="mb-6 rounded-[28px] border border-border bg-surface p-5">
        <p className="mb-1 text-xs font-medium text-muted">{t.yourCallsign}</p>
        <p className="mb-4 text-xs text-subtle">{t.identityHint}</p>
        <IdentityFields idPrefix="lobby" />
      </section>

      <div className="mb-6">
        <HouseRuleToggles
          locale={locale}
          rules={snapshot?.rules ?? DEFAULT_HOUSE_RULES}
          disabled={!isHost}
          onToggle={(key) => setHouseRules({ [key]: !(snapshot?.rules ?? DEFAULT_HOUSE_RULES)[key] })}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">
          {t.players} {players.length}/{MAX_PLAYERS}
        </h2>
        {isHost ? (
          <button
            type="button"
            onClick={() => {
              audio.play("join");
              addBot();
            }}
            disabled={players.length >= MAX_PLAYERS}
            className="flex h-11 items-center gap-1 text-sm text-accent disabled:opacity-40"
          >
            <Plus className="size-4" />
            {t.addBot}
          </button>
        ) : (
          <span className="text-xs text-subtle">{t.waitingHost}</span>
        )}
      </div>

      {!isHost && players.length === 0 ? (
        <div className="rounded-[18px] border border-border bg-surface px-4 py-6 text-center">
          <p className="text-sm text-muted">{t.joining}</p>
          <p className="mt-2 text-xs text-subtle">
            {peers.some((p) => p.connectionState === "connected")
              ? t.joinHandshaking
              : peers.some((p) => p.connectionState === "failed" || p.connectionState === "disconnected")
                ? t.failed
                : peers.length > 0 || signalCount > 1
                  ? t.connecting
                  : t.lookingForHost}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {players.map((p) => {
            const peer = peers.find((x) => x.id === p.id);
            const mine = p.id === selfId;
            const state = p.isBot
              ? "connected"
              : (peer?.connectionState ?? (p.connected ? "connected" : "connecting"));
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-[18px] border border-border bg-surface px-3 py-2.5"
              >
                <span className="flex size-11 items-center justify-center rounded-[12px] bg-surface-2 text-xl">
                  {mine ? selfEmoji : p.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {(mine && selfName.trim()) || p.name}
                    {p.id === snapshot?.hostId ? <span className="ml-2 text-xs text-muted">{t.captain}</span> : null}
                    {mine ? <span className="ml-2 text-xs text-accent">{t.you}</span> : null}
                  </p>
                  <p className={cn("text-xs", state === "failed" ? "text-danger" : "text-subtle")}>
                    {p.isBot ? t.bot : state === "connected" ? t.connected : state === "failed" ? t.failed : t.connecting}
                  </p>
                </div>
                {isHost && !mine && p.id !== snapshot?.hostId ? (
                  <button
                    type="button"
                    onClick={() => {
                      audio.play("click");
                      kick(p.id);
                    }}
                    className="flex h-11 shrink-0 items-center gap-1 rounded-[12px] px-2 text-xs text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={`${t.removeBot} ${p.name}`}
                  >
                    <X className="size-4" strokeWidth={1.75} />
                    {t.removeBot}
                  </button>
                ) : null}
              </li>
            );
          })}
          {pending.map((peer) => (
            <li
              key={peer.id}
              className="flex items-center gap-3 rounded-[18px] border border-dashed border-border px-3 py-2.5"
            >
              <span className="flex size-11 items-center justify-center rounded-[12px] bg-surface-2 text-subtle">
                ···
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-muted">{t.arriving}</p>
                <p className="text-xs text-subtle">
                  {peer.connectionState === "connected" ? t.joinHandshaking : t.connecting}
                </p>
              </div>
              {isHost ? (
                <button
                  type="button"
                  onClick={() => {
                    audio.play("click");
                    kick(peer.id);
                  }}
                  className="flex h-11 shrink-0 items-center gap-1 rounded-[12px] px-2 text-xs text-muted hover:bg-surface-2 hover:text-danger"
                  aria-label={t.removeBot}
                >
                  <X className="size-4" strokeWidth={1.75} />
                  {t.removeBot}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-8">
        <div className="mb-4">
          <ReactionBar />
        </div>
        {isHost ? (
          <>
            <Button
              size="lg"
              className="w-full"
              disabled={!canGo}
              onClick={() => {
                audio.play("start");
                startDive();
              }}
            >
              {t.start}
            </Button>
            <p className="mt-2 text-center text-xs text-subtle">{canGo ? t.hostStartHint : t.needPlayers}</p>
          </>
        ) : (
          <p className="text-center text-sm text-muted">{t.waitingHost}</p>
        )}
      </div>
        </>
      ) : null}
    </main>
  );
}
