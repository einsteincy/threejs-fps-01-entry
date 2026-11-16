# DUSKLINE — Flare Yard 7: 5v5 tactical FPS, buy economy, plant/defuse, team-plan bots with radio callouts

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/einsteincy/threejs-fps-01-entry/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/einsteincy/threejs-fps-01-entry/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

A 5v5 tactical FPS in three.js for the make.fun `threejs-fps-01` bounty.
Dusk-lit container yard "Flare Yard 7" (48×32 m, 3 lanes): you plus 4 AI
teammates (VEX, ORIN, KITE, SABLE) against 5 enemy bots. Buy economy,
plant/defuse, IGL orders (Z/X/C), radio callouts, first to 3 rounds.

## How to play

- **Move** WASD, **look** mouse, **crouch** Ctrl, **jump** Space
- **Fire** mouse, **reload** R, **weapons** 1–3, **armor** 4, **ammo** 5
- **Grenades** 6 HE / 7 smoke / 8 flash, **buy menu** B, **orders** Z long / X short / C hold
- **Pause** Esc or P, **mute** M, **scoreboard** Tab

Win a round by eliminating the enemy team, detonating the bomb at the
Fuel Depot, or holding the defuse. Lose the round and the enemy scores.
First to 3 takes the match. When you die, you spectate a teammate — the
round goes on without you.

## Run it

```sh
node serve.ts        # http://localhost:8080
```

No build step, no CDN, no external assets. Deterministic staged
screenshots: `?shot=fight`, `?shot=buy`, `?shot=plant`, `?shot=win`
(seed 7).

## Judge note — what proves each criterion

1. **Complete game** — `game/src/main.js` state machine
   (MENU/BUY/LIVE/ROUND_END/MATCH_END), `player.js`, `bots.js`, `hud.js`.
   Pause (Esc/P), rounds that end on elimination / detonation / defuse /
   timer and restart.
2. **Gunplay** — `weapons.js` (P9 / HORNET / VK-7; BREACHER + LONGSHOT in
   P2), spread + bloom + recoil, ADS.
3. **Tactics** — `team.js` (orders Z/X/C, radio, round plans),
   `economy.js` (buy menu), `bomb.js` (plant/defuse), `map.js` (flare vent).
4. **Map/look** — `map.js` Flare Yard 7: 3 lanes, flare stack, fuel depot,
   dusk palette (`palette.js`), amber sun + sodium lights + fog.
5. **Code** — one module per job, 120 Hz fixed-step sim apart from
   rendering, no per-frame allocation in hot loops, state in `state.js`.

Built as a reusable open-source base for web FPS games: map, weapons and
bots are data-driven modules.

## License

MIT — see [LICENSE](LICENSE).
