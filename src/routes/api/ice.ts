import { createFileRoute } from "@tanstack/react-router";
import { getIceServers, jsonIce, stunFallback } from "@/lib/multiplayer/ice.server";

const handle = async () => {
  try {
    return jsonIce(await getIceServers());
  } catch (error) {
    console.error("[ice] failed:", error);
    return jsonIce(stunFallback(), 200);
  }
};

export const Route = createFileRoute("/api/ice")({
  server: { handlers: { GET: handle } },
});
