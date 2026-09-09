/**
 * Server-only ICE config. Fetches Metered TURN credentials and caches them
 * so every guest/host join does not hit Metered. The API key never leaves
 * this process — clients call GET /api/ice.
 */

const METERED_APP = (process.env.METERED_APP ?? "five-fathoms").trim();
const METERED_API_KEY = (process.env.METERED_API_KEY ?? "").trim();
const CACHE_MS = 5 * 60 * 1000;
/** HK-adjacent first; global only if those fail. */
const REGIONS = ["singapore", "asia_east"] as const;

type IceCache = { at: number; servers: RTCIceServer[] };

const globalRef = globalThis as typeof globalThis & {
  __ffIceAsiaCache__?: IceCache;
  __ffIceInflight__?: Promise<RTCIceServer[]>;
};

export function stunFallback(): RTCIceServer[] {
  return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
}

function asServers(raw: unknown): RTCIceServer[] {
  if (!Array.isArray(raw)) return [];
  const out: RTCIceServer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const urls = (item as { urls?: unknown }).urls;
    if (typeof urls !== "string" && !Array.isArray(urls)) continue;
    const username = (item as { username?: unknown }).username;
    const credential = (item as { credential?: unknown }).credential;
    const entry: RTCIceServer = { urls: urls as string | string[] };
    if (typeof username === "string" && typeof credential === "string") {
      entry.username = username;
      entry.credential = credential;
    }
    out.push(entry);
  }
  return out;
}

function merge(lists: RTCIceServer[][]): RTCIceServer[] {
  const seen = new Set<string>();
  const out: RTCIceServer[] = [];
  for (const list of lists) {
    for (const server of list) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      const key = `${urls.join(",")}|${server.username ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(server);
    }
  }
  return out;
}

function hasTurn(servers: RTCIceServer[]): boolean {
  return servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => u.startsWith("turn:") || u.startsWith("turns:"));
  });
}

async function fetchRegion(region?: string): Promise<RTCIceServer[]> {
  const url = new URL(`https://${METERED_APP}.metered.live/api/v1/turn/credentials`);
  url.searchParams.set("apiKey", METERED_API_KEY);
  if (region) url.searchParams.set("region", region);
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`metered ${region ?? "default"} ${res.status}`);
  return asServers(await res.json());
}

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (!METERED_API_KEY) return stunFallback();

  const cached = globalRef.__ffIceAsiaCache__;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.servers;

  if (!globalRef.__ffIceInflight__) {
    globalRef.__ffIceInflight__ = (async () => {
      const lists = await Promise.all(
        REGIONS.map((region) => fetchRegion(region).catch(() => [] as RTCIceServer[])),
      );
      let merged = merge([stunFallback(), ...lists]);
      if (!hasTurn(merged)) {
        const global = await fetchRegion("global").catch(() => [] as RTCIceServer[]);
        merged = merge([stunFallback(), global]);
      }
      const servers = hasTurn(merged) ? merged : stunFallback();
      globalRef.__ffIceAsiaCache__ = { at: Date.now(), servers };
      return servers;
    })().finally(() => {
      globalRef.__ffIceInflight__ = undefined;
    });
  }

  try {
    return await globalRef.__ffIceInflight__;
  } catch {
    return cached?.servers ?? stunFallback();
  }
}

export function jsonIce(servers: RTCIceServer[], status = 200): Response {
  return new Response(JSON.stringify({ iceServers: servers }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
