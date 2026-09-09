import { useState } from "react";
import { Anchor, HelpCircle } from "lucide-react";
import { MuteButton } from "@/components/game/mute-button";
import { HouseRuleToggles } from "@/components/game/house-rules";
import { Button } from "@/components/ui/button";
import { IdentityFields } from "@/components/game/identity-fields";
import { copy } from "@/lib/game/i18n";
import { audio } from "@/lib/game/audio";
import { useGameStore } from "@/lib/game/store";
import { DEFAULT_HOUSE_RULES, type HouseRules } from "@/lib/game/types";

export function Landing({ pendingCode }: { pendingCode?: string }) {
  const locale = useGameStore((s) => s.locale);
  const setLocale = useGameStore((s) => s.setLocale);
  const setRulesOpen = useGameStore((s) => s.setRulesOpen);
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const startPractice = useGameStore((s) => s.startPractice);
  const t = copy[locale];
  const [code, setCode] = useState(pendingCode ?? "");
  const [joinOpen, setJoinOpen] = useState(Boolean(pendingCode));
  const [rules, setRules] = useState<HouseRules>(DEFAULT_HOUSE_RULES);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mb-8 flex items-center justify-between">
        <button
          type="button"
          className="text-xs tracking-[0.18em] text-muted"
          onClick={() => setLocale(locale === "zh-Hant" ? "en" : "zh-Hant")}
        >
          {t.language}
        </button>
        <div className="flex items-center gap-1">
          <MuteButton />
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-[12px] text-muted hover:text-fg"
            onClick={() => setRulesOpen(true)}
            aria-label={t.rules}
          >
            <HelpCircle className="size-5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <figure className="mb-8 overflow-hidden rounded-[22px] border border-border bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <img
          src="/og.jpg"
          alt={`${t.title} ${t.titleEn}`}
          width={1200}
          height={630}
          className="aspect-[16/9] w-full object-cover object-center"
        />
      </figure>

      <header className="mb-8">
        <p className="mb-3 flex items-center gap-2 text-xs tracking-[0.22em] text-muted">
          <Anchor className="size-3.5" strokeWidth={1.75} />
          {t.titleEn}
        </p>
        <h1 className="font-display text-[clamp(3rem,12vw,4.25rem)] leading-[0.95] tracking-tight text-fg">
          {t.title}
        </h1>
        <p className="mt-4 max-w-[20ch] text-base leading-relaxed text-muted">{t.tagline}</p>
      </header>

      <IdentityFields idPrefix="landing" tone="page" />

      <div className="mt-8">
        <HouseRuleToggles
          locale={locale}
          rules={rules}
          onToggle={(key) => setRules((prev) => ({ ...prev, [key]: !prev[key] }))}
        />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Button
          size="lg"
          onClick={() => {
            audio.play("start");
            createRoom(rules);
          }}
          className="w-full"
        >
          {t.create}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setJoinOpen(true)} className="w-full">
          {t.join}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => {
            audio.play("start");
            startPractice(rules);
          }}
          className="w-full"
        >
          {t.practice}
        </Button>
        <p className="text-center text-xs text-subtle">{t.practiceHint}</p>
      </div>

      {joinOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[28px] border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <h2 className="font-display text-xl">{t.join}</h2>
            <p className="mt-1 text-sm text-muted">{t.joinIdentityHint}</p>
            <div className="mt-5">
              <IdentityFields idPrefix="join" autoFocus={Boolean(pendingCode)} />
            </div>
            <label className="mb-2 mt-6 block text-xs font-medium text-muted" htmlFor="join-code">
              {t.roomCode}
            </label>
            <input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t.enterCode}
              maxLength={8}
              readOnly={Boolean(pendingCode)}
              autoFocus={!pendingCode}
              className="h-12 w-full rounded-[16px] border border-border bg-bg px-4 font-mono text-lg tracking-[0.3em] text-fg outline-none focus:ring-2 focus:ring-accent/50 read-only:text-muted"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setJoinOpen(false)}>
                {t.close}
              </Button>
              <Button className="flex-1" onClick={() => joinRoom(code)}>
                {t.continue}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
