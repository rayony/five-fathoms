/**
 * Star-topology WebRTC rooms, following @boardgame.io/p2p:
 * the host is the master; guests connect only to the host. Game traffic
 * never goes guest↔guest. Signaling (SDP/ICE) still relays through /api/rtc.
 *
 * Host always dials. Guests wait for the host offer. One reliable ordered
 * data channel carries join/choice/snapshot — same idea as boardgame.io
 * sendAction / update.
 */

export type SignalKind = "offer" | "answer" | "ice";

export interface PeerRow {
  id: string;
  name: string;
}
export interface SignalRow {
  id: number;
  from: string;
  kind: SignalKind;
  payload: unknown;
}
export interface RtcPollResponse {
  peers: PeerRow[];
  signals: SignalRow[];
}

export interface PeerInfo {
  id: string;
  name: string;
  connectionState: RTCPeerConnectionState;
  candidateType: string | null;
  rttMs: number | null;
}

export interface P2PRoomOptions {
  room: string;
  selfId: string;
  name?: string;
  /** Host = master. Guests only pair with the host. */
  isHost?: boolean;
  iceServers?: RTCIceServer[];
  onPeersChanged?: (peers: PeerInfo[]) => void;
  onMessage?: (from: string, data: unknown, channel: "state" | "reliable") => void;
  onConnected?: () => void;
  onChannelOpen?: (peerId: string) => void;
  /** Raw signaling roster (includes this client). */
  onSignalingRoster?: (peers: PeerRow[]) => void;
}

interface PeerSlot {
  pc: RTCPeerConnection;
  reliable?: RTCDataChannel;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  lastProgressAt: number;
  recoveryAttempts: number;
  terminal?: boolean;
  recreatedForOffer?: boolean;
  info: PeerInfo;
  pingSentAt?: number;
  pendingReliable: string[];
}

const FAST_POLL_MS = 400;
const IDLE_POLL_MS = 2000;
const PING_INTERVAL_MS = 2000;
const STALL_MS = 12_000;
const MAX_RECOVERY_ATTEMPTS = 4;
const SIGNAL_RETRY_DELAYS_MS = [250, 750];
const QUEUE_CAP = 32;

export function hostSignalingName(label: string): string {
  return `1|${label}`.slice(0, 32);
}
export function guestSignalingName(label: string): string {
  return `0|${label}`.slice(0, 32);
}
export function isHostSignalingName(name: string): boolean {
  return name.startsWith("1|");
}

export function defaultIceServers(): RTCIceServer[] {
  const urls = (import.meta.env.VITE_STUN_URLS as string | undefined)
    ?.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return [
    {
      urls: urls?.length ? urls : ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"],
    },
  ];
}

function encode(data: unknown): string {
  return JSON.stringify({ t: "d", d: data });
}

export class P2PRoom {
  private readonly opts: P2PRoomOptions;
  private readonly peers = new Map<string, PeerSlot>();
  private readonly signalQueues = new Map<string, Promise<void>>();
  private readonly orphanReliable = new Map<string, string[]>();
  private pendingBroadcast: string[] = [];
  private cursor = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private everPolled = false;
  private lastPeersFingerprint = "";
  private blocked = new Set<string>();

  constructor(opts: P2PRoomOptions) {
    this.opts = opts;
  }

  private get isHost(): boolean {
    return Boolean(this.opts.isHost);
  }

  async join(): Promise<void> {
    try {
      await this.pollOnce();
    } catch {
      /* first poll can fail; the loop retries */
    }
    if (this.closed) return;
    this.schedulePoll(this.anyPairConnecting() ? FAST_POLL_MS : IDLE_POLL_MS);
    this.pingTimer = setInterval(() => {
      this.pingAll();
      this.watchdog();
    }, PING_INTERVAL_MS);
  }

  close(): void {
    this.closed = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    for (const slot of this.peers.values()) slot.pc.close();
    this.peers.clear();
    void fetch("/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "leave", room: this.opts.room, peer: this.opts.selfId }),
      keepalive: true,
    }).catch(() => {});
  }

  broadcast(data: unknown): void {
    this.send(data);
  }

  send(data: unknown, peerId?: string): void {
    const wire = encode(data);
    if (peerId) {
      const slot = this.peers.get(peerId);
      if (slot) this.deliverReliable(slot, wire);
      else this.queueOrphan(peerId, wire);
      return;
    }
    if (this.peers.size === 0) {
      this.pendingBroadcast.push(wire);
      if (this.pendingBroadcast.length > QUEUE_CAP) this.pendingBroadcast.shift();
      return;
    }
    for (const slot of this.peers.values()) this.deliverReliable(slot, wire);
  }

  drop(peerId: string): void {
    const slot = this.peers.get(peerId);
    if (!slot) return;
    slot.terminal = true;
    try {
      slot.pc.close();
    } catch {
      /* already closed */
    }
    this.peers.delete(peerId);
    this.emitPeers();
  }

  /** Host: stop pairing with this peer and tear the link down. */
  block(peerId: string): void {
    this.blocked.add(peerId);
    this.drop(peerId);
  }

  peerList(): PeerInfo[] {
    return [...this.peers.values()].map((s) => ({ ...s.info }));
  }

  private queueOrphan(peerId: string, wire: string): void {
    const list = this.orphanReliable.get(peerId) ?? [];
    list.push(wire);
    if (list.length > QUEUE_CAP) list.shift();
    this.orphanReliable.set(peerId, list);
  }

  private deliverReliable(slot: PeerSlot, wire: string): void {
    if (slot.reliable?.readyState === "open") {
      try {
        slot.reliable.send(wire);
        return;
      } catch {
        /* queue */
      }
    }
    slot.pendingReliable.push(wire);
    if (slot.pendingReliable.length > QUEUE_CAP) slot.pendingReliable.shift();
  }

  private flushReliable(slot: PeerSlot): void {
    if (slot.reliable?.readyState !== "open") return;
    if (this.pendingBroadcast.length) {
      slot.pendingReliable.push(...this.pendingBroadcast);
      this.pendingBroadcast = [];
    }
    const queued = slot.pendingReliable.splice(0);
    for (let i = 0; i < queued.length; i++) {
      try {
        slot.reliable.send(queued[i]!);
      } catch {
        slot.pendingReliable.unshift(...queued.slice(i));
        return;
      }
    }
  }

  private schedulePoll(delay: number): void {
    if (this.closed) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.poll(), delay);
  }

  private anyPairConnecting(): boolean {
    if (!this.isHost && this.peers.size === 0) return true;
    for (const s of this.peers.values()) {
      if (s.terminal) continue;
      if (s.info.connectionState !== "connected") return true;
    }
    return false;
  }

  private async pollOnce(): Promise<void> {
    const params = new URLSearchParams({
      room: this.opts.room,
      peer: this.opts.selfId,
      name: this.opts.name ?? "",
      since: String(this.cursor),
    });
    const res = await fetch(`/api/rtc?${params}`);
    if (this.closed) return;
    if (!res.ok) throw new Error(`signaling poll failed: ${res.status}`);
    const body = (await res.json()) as RtcPollResponse;
    if (this.closed) return;
    if (!this.everPolled) {
      this.everPolled = true;
      this.opts.onConnected?.();
    }
    this.opts.onSignalingRoster?.(body.peers);
    this.reconcileRoster(body.peers);
    const roster = new Set(body.peers.map((p) => p.id));
    for (const sig of body.signals) {
      this.cursor = Math.max(this.cursor, sig.id);
      await this.onSignal(sig.from, sig.kind, sig.payload, roster);
      if (this.closed) return;
    }
  }

  private async poll(): Promise<void> {
    if (this.closed) return;
    try {
      await this.pollOnce();
    } catch {
      /* retry */
    }
    this.schedulePoll(this.anyPairConnecting() ? FAST_POLL_MS : IDLE_POLL_MS);
  }

  private shouldPair(remote: PeerRow, roster: PeerRow[]): boolean {
    if (remote.id === this.opts.selfId) return false;
    if (this.blocked.has(remote.id)) return false;
    if (this.isHost) return true;
    if (isHostSignalingName(remote.name)) return true;
    const others = roster.filter((p) => p.id !== this.opts.selfId);
    if (others.length === 1 && others[0]?.id === remote.id) return true;
    return false;
  }

  private reconcileRoster(peers: PeerRow[]): void {
    const alive = new Set(peers.map((p) => p.id));
    for (const p of peers) {
      if (!this.shouldPair(p, peers)) continue;
      const existing = this.peers.get(p.id);
      if (existing) {
        existing.info.name = p.name;
      } else {
        this.connectTo(p.id, p.name, this.isHost);
      }
    }
    for (const [id, slot] of this.peers) {
      if (!alive.has(id)) {
        slot.pc.close();
        this.peers.delete(id);
      }
    }
    this.emitPeers();
  }

  private connectTo(peerId: string, name: string, initiator: boolean): PeerSlot | null {
    if (this.closed) return null;
    if (this.blocked.has(peerId)) return null;
    const inherited = this.peers.get(peerId)?.pendingReliable ?? this.orphanReliable.get(peerId) ?? [];
    this.orphanReliable.delete(peerId);
    const pc = new RTCPeerConnection({
      iceServers: this.opts.iceServers ?? defaultIceServers(),
    });
    const slot: PeerSlot = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      lastProgressAt: Date.now(),
      recoveryAttempts: 0,
      pendingReliable: [...inherited],
      info: {
        id: peerId,
        name,
        connectionState: pc.connectionState,
        candidateType: null,
        rttMs: null,
      },
    };
    this.peers.set(peerId, slot);

    pc.onicecandidate = (e) => {
      if (e.candidate) void this.sendSignal(peerId, "ice", e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      slot.info.connectionState = pc.connectionState;
      if (pc.connectionState === "connecting" || pc.connectionState === "connected") {
        slot.lastProgressAt = Date.now();
      }
      if (pc.connectionState === "connected") {
        slot.recoveryAttempts = 0;
        slot.terminal = false;
        void this.readCandidateType(slot);
      }
      this.emitPeers();
      if (pc.connectionState === "failed") pc.restartIce();
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.schedulePoll(FAST_POLL_MS);
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        slot.makingOffer = true;
        await pc.setLocalDescription();
        await this.sendSignal(peerId, "offer", pc.localDescription!.toJSON());
      } catch {
        /* next negotiationneeded retries */
      } finally {
        slot.makingOffer = false;
      }
    };
    pc.ondatachannel = (e) => this.attachChannel(slot, e.channel);

    if (initiator) {
      this.attachChannel(slot, pc.createDataChannel("reliable", { ordered: true }));
    }
    return slot;
  }

  private attachChannel(slot: PeerSlot, channel: RTCDataChannel): void {
    slot.reliable = channel;
    channel.onopen = () => {
      slot.lastProgressAt = Date.now();
      this.flushReliable(slot);
      this.opts.onChannelOpen?.(slot.info.id);
    };
    channel.onmessage = (e) => {
      let msg: { t: string; d?: unknown };
      try {
        msg = JSON.parse(String(e.data)) as { t: string; d?: unknown };
      } catch {
        return;
      }
      if (msg.t === "ping") {
        if (slot.reliable?.readyState === "open") {
          try {
            slot.reliable.send(JSON.stringify({ t: "pong" }));
          } catch {
            /* ignore */
          }
        }
      } else if (msg.t === "pong") {
        if (slot.pingSentAt) {
          slot.info.rttMs = Math.round(performance.now() - slot.pingSentAt);
          slot.pingSentAt = undefined;
          this.emitPeers();
        }
      } else {
        this.opts.onMessage?.(slot.info.id, msg.d, "reliable");
      }
    };
  }

  private async flushPendingCandidates(slot: PeerSlot): Promise<void> {
    while (slot.pendingCandidates.length > 0) {
      const candidate = slot.pendingCandidates.shift()!;
      try {
        await slot.pc.addIceCandidate(candidate);
      } catch (err) {
        if (!slot.ignoreOffer) console.warn("[p2p] addIceCandidate failed:", err);
      }
      if (this.closed) return;
    }
  }

  private async onSignal(
    from: string,
    kind: SignalKind,
    payload: unknown,
    roster: Set<string>,
  ): Promise<void> {
    if (this.closed) return;
    if (this.blocked.has(from)) return;
    if (!this.isHost && this.peers.has(from) === false) {
      // Guest only accepts the host. If we have no slot yet, still take the
      // offer — the host is the only one who dials.
    }
    let slot = this.peers.get(from);
    if (!slot) {
      if (!roster.has(from)) return;
      if (!this.isHost && this.peers.size > 0) return;
      const created = this.connectTo(from, "", false);
      if (!created) return;
      slot = created;
    }
    const polite = !this.isHost;

    try {
      if (kind === "offer" || kind === "answer") {
        const description = payload as RTCSessionDescriptionInit;
        const collision =
          kind === "offer" && (slot.makingOffer || slot.pc.signalingState !== "stable");
        slot.ignoreOffer = !polite && collision;
        if (slot.ignoreOffer) return;
        try {
          await slot.pc.setRemoteDescription(description);
        } catch (err) {
          if (kind !== "offer" || slot.recreatedForOffer) throw err;
          const attempts = slot.recoveryAttempts;
          const name = slot.info.name;
          const pending = slot.pendingReliable;
          slot.pc.close();
          this.peers.delete(from);
          const fresh = this.connectTo(from, name, false);
          if (!fresh) return;
          fresh.recoveryAttempts = attempts;
          fresh.recreatedForOffer = true;
          fresh.pendingReliable = pending;
          slot = fresh;
          await slot.pc.setRemoteDescription(description);
        }
        if (this.closed) return;
        await this.flushPendingCandidates(slot);
        if (this.closed) return;
        if (kind === "offer") {
          await slot.pc.setLocalDescription();
          if (this.closed) return;
          await this.sendSignal(from, "answer", slot.pc.localDescription!.toJSON());
        }
      } else if (kind === "ice") {
        const candidate = payload as RTCIceCandidateInit;
        if (!slot.pc.remoteDescription) {
          slot.pendingCandidates.push(candidate);
          return;
        }
        try {
          await slot.pc.addIceCandidate(candidate);
        } catch (err) {
          if (!slot.ignoreOffer) console.warn("[p2p] addIceCandidate failed:", err);
        }
      }
    } catch {
      /* visible via connectionState */
    }
  }

  private sendSignal(to: string, kind: SignalKind, payload: unknown): Promise<void> {
    const prev = this.signalQueues.get(to) ?? Promise.resolve();
    const next = prev.then(() => this.postSignal(to, kind, payload));
    this.signalQueues.set(to, next.catch(() => {}));
    return next;
  }

  private async postSignal(to: string, kind: SignalKind, payload: unknown): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      if (this.closed) return;
      try {
        const res = await fetch("/api/rtc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            op: "signal",
            room: this.opts.room,
            from: this.opts.selfId,
            to,
            kind,
            payload,
          }),
        });
        if (res.ok) return;
        throw new Error(`signal POST failed: ${res.status}`);
      } catch (err) {
        if (attempt >= SIGNAL_RETRY_DELAYS_MS.length) {
          console.warn(`[p2p] signal ${kind} to ${to} failed after retries`, err);
          return;
        }
        await new Promise((r) => setTimeout(r, SIGNAL_RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  private pingAll(): void {
    const wire = JSON.stringify({ t: "ping" });
    for (const slot of this.peers.values()) {
      if (slot.reliable?.readyState !== "open") continue;
      const stale =
        slot.pingSentAt !== undefined && performance.now() - slot.pingSentAt > 2 * PING_INTERVAL_MS;
      if (slot.pingSentAt === undefined || stale) {
        slot.pingSentAt = performance.now();
        try {
          slot.reliable.send(wire);
        } catch {
          /* ignore */
        }
      }
    }
  }

  private watchdog(): void {
    if (this.closed) return;
    const now = Date.now();
    for (const [peerId, slot] of this.peers) {
      const live = slot.pc.connectionState;
      if (live !== slot.info.connectionState) {
        slot.info.connectionState = live;
        if (live === "connecting" || live === "connected") slot.lastProgressAt = now;
        this.emitPeers();
      }
      if (slot.terminal || live === "connected") continue;
      if (now - slot.lastProgressAt <= STALL_MS) continue;
      if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        slot.terminal = true;
        this.emitPeers();
        continue;
      }
      slot.recoveryAttempts += 1;
      slot.lastProgressAt = now;
      if (this.isHost) {
        const { name } = slot.info;
        const attempts = slot.recoveryAttempts;
        const pending = slot.pendingReliable;
        slot.pc.close();
        this.peers.delete(peerId);
        const fresh = this.connectTo(peerId, name, true);
        if (fresh) {
          fresh.recoveryAttempts = attempts;
          fresh.pendingReliable = pending;
        }
        this.schedulePoll(FAST_POLL_MS);
      }
    }
  }

  private async readCandidateType(slot: PeerSlot): Promise<void> {
    try {
      const stats = await slot.pc.getStats();
      let selected: RTCIceCandidatePairStats | undefined;
      stats.forEach((s) => {
        if (s.type === "candidate-pair" && (s as RTCIceCandidatePairStats).nominated) {
          selected = s as RTCIceCandidatePairStats;
        }
      });
      const localId = selected?.localCandidateId;
      if (localId) {
        const local = stats.get(localId) as { candidateType?: string } | undefined;
        slot.info.candidateType = local?.candidateType ?? null;
        this.emitPeers();
      }
    } catch {
      /* diagnostics only */
    }
  }

  private emitPeers(): void {
    const list = this.peerList();
    const fingerprint = JSON.stringify(
      list.map((p) => [p.id, p.name, p.connectionState, p.candidateType, p.rttMs]),
    );
    if (fingerprint === this.lastPeersFingerprint) return;
    this.lastPeersFingerprint = fingerprint;
    this.opts.onPeersChanged?.(list);
  }
}
