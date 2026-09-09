import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/game/app";

export const Route = createFileRoute("/")({
  validateSearch: (raw: Record<string, unknown>) => ({
    r: typeof raw.r === "string" ? raw.r.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) : undefined,
  }),
  component: Home,
});

function Home() {
  const { r } = Route.useSearch();
  return <GameApp pendingCode={r} />;
}
