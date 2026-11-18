// The ONE match-state object (DESIGN.md §4): every module reads and writes this
// object, nothing else holds match state. Phases: MENU -> BUY -> LIVE ->
// ROUND_END -> MATCH_END, plus PAUSED overlaying BUY/LIVE (sim frozen).
export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
};

export const ROUND_END_CAUSE = {
  ELIMINATION: 'elimination',
  DETONATION: 'detonation',
  DEFUSE: 'defuse',
  TIME: 'time',
};

// Player settings (DESIGN.md §15.5, P2): in-memory only, no localStorage —
// the game runs from static files and the review is a single session. The
// sensitivity slider applies immediately; volume is consumed by audio.js
// (P3). Deliberately outside createMatchState so a round reset never wipes
// the reviewer's settings.
export const settings = {
  sensitivity: 1,
  volume: 1,
};

export function createMatchState() {
  const state = {
    phase: PHASE.MENU,
    paused: false,
    round: 1,
    scoreDusk: 0,
    scoreBots: 0,
    roundTimer: 100,
    buyTimer: 15,
    fuseTimer: 0,
    planted: false,
    plantProgress: 0,
    defuseProgress: 0,
    money: 800,
    kills: 0,
    deaths: 0,
    roundKills: 0,
    elapsed: 0,
    roundElapsed: 0,
    noise: [],
    noiseMask: 1,
    ventActive: false,
    plan: 'LONG EXECUTE',
    order: null,
    spectating: null,
    winner: null,
    roundEndCause: null,
    mvp: null,
    firstContactAt: -1,
    reset() {
      state.phase = PHASE.MENU;
      state.paused = false;
      state.round = 1;
      state.scoreDusk = 0;
      state.scoreBots = 0;
      state.roundTimer = 100;
      state.buyTimer = 15;
      state.fuseTimer = 0;
      state.planted = false;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.money = 800;
      state.kills = 0;
      state.deaths = 0;
      state.roundKills = 0;
      state.elapsed = 0;
      state.roundElapsed = 0;
      state.noise.length = 0;
      state.noiseMask = 1;
      state.ventActive = false;
      state.plan = 'LONG EXECUTE';
      state.order = null;
      state.spectating = null;
      state.winner = null;
      state.roundEndCause = null;
      state.mvp = null;
      state.firstContactAt = -1;
    },
  };
  return state;
}

// Deterministic PRNG (mulberry32) so ?shot= captures and scripted rounds replay.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
