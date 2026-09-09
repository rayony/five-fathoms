# 五尋 Five Fathoms

Press-your-luck wreck dive for 3–8 players. Traditional Chinese first. One host creates a room; friends join by QR or room code. Spectators can watch after the dive starts.

Play it: host as the signalling server in the browser (WebRTC). Phones on different networks need a TURN key (`METERED_API_KEY`).

## House rules (host)

- **保證下潛成功 / Guaranteed descent** — the first three cards of each fathom skip hazards (put back and draw again).
- **護身符 / Amulet** — two copies of each hazard instead of three; a collapse does not remove that kind.

## Deck

**Pearls — 15 cards, values 1–17**

`1 · 2 · 3 · 4 · 5 · 5 · 7 · 7 · 9 · 11 · 11 · 13 · 14 · 15 · 17`

Leftovers from a split sit on the path until someone surfaces.

**Hazards — 15 cards, 5 kinds × 3** (or × 2 with Amulet)

| Hazard | 災難 | Copies |
| --- | --- | --- |
| Shark | 鯊魚 | 3 |
| Jellyfish | 水母 | 3 |
| Current | 渦流 | 3 |
| Cave-in | 塌艙 | 3 |
| Blackwater | 黑水 | 3 |

Blackwater **is** a hazard. A second copy of any one kind collapses the wreck; unsaved pearls in the hold are lost. That copy leaves the game unless Amulet is on.

Each fathom also adds one relic (5 in the game). Relics score 5, 5, 5, 10, 10 in claim order.

## Play

Five fathoms. First card of a descent flips itself. Then everyone still inside secretly chooses: dive again, or surface to the bell. Treasure splits among those still in the wreck. Surface together to split leftovers; surface alone to take every leftover relic.

Bell totals stay hidden until the fifth fathom.

## Dev

```
npm install
npm run dev
```

Set `METERED_API_KEY` (and optional `METERED_APP`) for TURN. Copy `.env.example`.
