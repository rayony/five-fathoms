import type { ReactionEmoji } from "./protocol";

const BGM_KEY = "ff-mute-bgm";
const SFX_KEY = "ff-mute-sfx";
const LEGACY_KEY = "ff-audio-mute";

export type SfxName =
  | "click"
  | "stay"
  | "leave"
  | "pearl"
  | "artifact"
  | "hazard"
  | "flip"
  | "start"
  | "reveal"
  | "join"
  | "bubble"
  | "collapse"
  | "reactDown"
  | "reactUp"
  | "reactSalute"
  | "reactBoom"
  | "reactPoop"
  | "reactTear";

const SFX: Record<SfxName, { src: string; volume: number }> = {
  click: { src: "/audio/sfx-click.ogg", volume: 0.45 },
  stay: { src: "/audio/sfx-stay.ogg", volume: 0.5 },
  leave: { src: "/audio/sfx-leave.ogg", volume: 0.5 },
  pearl: { src: "/audio/sfx-pearl.ogg", volume: 0.55 },
  artifact: { src: "/audio/sfx-artifact.ogg", volume: 0.5 },
  hazard: { src: "/audio/sfx-hazard.ogg", volume: 0.62 },
  flip: { src: "/audio/sfx-flip.ogg", volume: 0.4 },
  start: { src: "/audio/sfx-start.ogg", volume: 0.5 },
  reveal: { src: "/audio/sfx-reveal.ogg", volume: 0.45 },
  join: { src: "/audio/sfx-join.ogg", volume: 0.45 },
  bubble: { src: "/audio/sfx-bubble.wav", volume: 0.4 },
  collapse: { src: "/audio/sfx-collapse.ogg", volume: 0.7 },
  reactDown: { src: "/audio/sfx-react-down.ogg", volume: 0.62 },
  reactUp: { src: "/audio/sfx-react-up.ogg", volume: 0.58 },
  reactSalute: { src: "/audio/sfx-react-salute.ogg", volume: 0.6 },
  reactBoom: { src: "/audio/sfx-react-boom.ogg", volume: 0.7 },
  reactPoop: { src: "/audio/sfx-react-poop.ogg", volume: 0.65 },
  reactTear: { src: "/audio/sfx-react-tear.ogg", volume: 0.55 },
};

const REACT_SFX: Record<ReactionEmoji, SfxName> = {
  "👎🏼": "reactDown",
  "👍🏼": "reactUp",
  "🫡": "reactSalute",
  "💥": "reactBoom",
  "💩": "reactPoop",
  "🥹": "reactTear",
};

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn();
}

function readFlag(key: string, fallback = false): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
    if (key !== LEGACY_KEY && window.localStorage.getItem(LEGACY_KEY) === "1") return true;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

class AudioBus {
  bgmMuted = readFlag(BGM_KEY);
  sfxMuted = readFlag(SFX_KEY);
  private unlocked = false;
  private bgm: HTMLAudioElement | null = null;
  private collapseTimer: number | null = null;
  private bgmVolume = 0.2;
  private cache = new Map<string, HTMLAudioElement>();
  private preloadPromise: Promise<void> | null = null;
  preloaded = false;

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  isMuted(): boolean {
    return this.bgmMuted && this.sfxMuted;
  }

  setBgmMuted(muted: boolean) {
    this.bgmMuted = muted;
    writeFlag(BGM_KEY, muted);
    if (this.bgm) this.bgm.volume = muted ? 0 : this.bgmVolume;
    if (!muted) this.unlock();
    emit();
  }

  setSfxMuted(muted: boolean) {
    this.sfxMuted = muted;
    writeFlag(SFX_KEY, muted);
    if (muted) this.stopCollapse();
    emit();
  }

  toggle() {
    const next = !this.isMuted();
    this.setBgmMuted(next);
    this.setSfxMuted(next);
  }

  setBgmLevel(level: number) {
    this.bgmVolume = level;
    if (this.bgm && !this.bgmMuted) this.bgm.volume = level;
  }

  unlock() {
    if (typeof window === "undefined") return;
    this.unlocked = true;
    this.ensureBgm();
    if (!this.bgmMuted) void this.bgm?.play().catch(() => {});
    void this.preloadAll();
  }

  isPreloaded(): boolean {
    return this.preloaded;
  }

  preloadAll(): Promise<void> {
    if (typeof Audio === "undefined") {
      this.preloaded = true;
      return Promise.resolve();
    }
    if (this.preloaded) return Promise.resolve();
    if (this.preloadPromise) return this.preloadPromise;
    this.ensureBgm();
    const urls = ["/audio/bgm-wreck.ogg", ...Object.values(SFX).map((s) => s.src)];
    this.preloadPromise = Promise.race([
      Promise.all(urls.map((url) => this.warm(url))),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 8000);
      }),
    ]).then(() => {
      this.preloaded = true;
    });
    return this.preloadPromise;
  }

  private warm(url: string): Promise<void> {
    return new Promise((resolve) => {
      const existing = this.cache.get(url);
      if (existing && existing.readyState >= 3) {
        resolve();
        return;
      }
      const el = existing ?? new Audio();
      el.preload = "auto";
      el.src = url;
      const done = () => resolve();
      el.addEventListener("canplaythrough", done, { once: true });
      el.addEventListener("error", done, { once: true });
      this.cache.set(url, el);
      el.load();
    });
  }

  private source(url: string): HTMLAudioElement {
    const proto = this.cache.get(url);
    if (proto) {
      const clone = proto.cloneNode(true) as HTMLAudioElement;
      return clone;
    }
    return new Audio(url);
  }

  private ensureBgm() {
    if (this.bgm || typeof Audio === "undefined") return;
    const el = new Audio("/audio/bgm-wreck.ogg");
    el.loop = true;
    el.preload = "auto";
    el.volume = this.bgmMuted ? 0 : this.bgmVolume;
    this.bgm = el;
  }

  play(name: SfxName) {
    if (this.sfxMuted || typeof Audio === "undefined") return;
    const spec = SFX[name];
    const el = this.source(spec.src);
    el.volume = spec.volume;
    if (name === "collapse") {
      this.stopCollapse();
      this.collapseTimer = window.setTimeout(() => {
        el.pause();
        this.collapseTimer = null;
      }, 4800);
    }
    void el.play().catch(() => {});
  }

  playReact(emoji: string) {
    const name = REACT_SFX[emoji as ReactionEmoji];
    this.play(name ?? "click");
  }

  private stopCollapse() {
    if (this.collapseTimer) {
      window.clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }
}

export const audio = new AudioBus();

export function armAudioUnlock() {
  if (typeof window === "undefined") return;
  const once = () => {
    audio.unlock();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  };
  window.addEventListener("pointerdown", once);
  window.addEventListener("keydown", once);
}
