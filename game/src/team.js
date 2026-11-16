// DUSK team (DESIGN.md §13.1/§13.2 + §15.5 playbook): the player + 4 AI
// teammates. Deterministic round plans, radio callouts, trading, ORIN plants,
// bomb handoff, simulated teammate economy. Orders (Z/X/C) override the plan.
import { ROUTES } from './map.js';

export const PLAYBOOK = {
  'LONG EXECUTE': { name: 'LONG EXECUTE', lanes: ['LONG', 'LONG', 'LONG', 'MID'] },
  'SHORT EXECUTE': { name: 'SHORT EXECUTE', lanes: ['SHORT', 'SHORT', 'SHORT', 'MID'] },
  SPLIT: { name: 'SPLIT', lanes: ['LONG', 'SHORT', 'LONG', 'SHORT'] },
  'HOLD-SAVE': { name: 'HOLD-SAVE', lanes: ['HOLD', 'HOLD', 'HOLD', 'HOLD'] },
  RETAKE: { name: 'RETAKE', lanes: ['SITE', 'SITE', 'SITE', 'SITE'] },
};

export const ROLES = {
  VEX: 'entry / trader',
  ORIN: 'support / planter',
  KITE: 'anchor / lurker',
  SABLE: 'rotator / Long watch',
};

export function laneOf(x, z) {
  if (x > 11 && z < -6) return 'SITE';
  if (z < -8) return 'LONG';
  if (z > 8) return 'SHORT';
  return 'MID';
}

export function planForRound(round) {
  if (round === 1) return 'LONG EXECUTE';
  if (round === 2) return 'SHORT EXECUTE';
  if (round === 3) return 'SPLIT';
  return round % 2 === 0 ? 'SHORT EXECUTE' : 'LONG EXECUTE';
}

export function createTeam(bots, hooks) {
  const byName = {};
  for (const b of bots) byName[b.callsign] = b;
  const team = {
    bots,
    byName,
    plan: 'LONG EXECUTE',
    order: null,
    feed: [],
    carrier: null,
    decisionTimer: 0,
    radio(event, data = {}) {
      const lane = data.lane ?? laneOf(data.x ?? 0, data.z ?? 0);
      let line = null;
      switch (event) {
        case 'spot': line = `${data.who}: CONTACT ${lane}`; break;
        case 'kill': line = `${data.who}: DOWN — ${lane}`; break;
        case 'death': line = `${data.who}: ${data.name} DOWN`; break;
        case 'plantStart': line = 'ORIN: PLANTING'; break;
        case 'plantDone': line = 'ORIN: BOMB DOWN'; break;
        case 'lowHp': line = `${data.who}: I'M HIT — ${lane}`; break;
        case 'rotate': line = `${data.who}: ROTATING ${lane}`; break;
        case 'bombDropped': line = `RADIO: BOMB DOWN — ${lane}`; break;
        case 'defuse': line = `${data.who}: DEFUSE — SITE`; break;
        case 'order': line = `${data.who}: COPY — ${data.plan}`; break;
        case 'pickup': line = `${data.who}: GOT THE BOMB`; break;
        default: break;
      }
      if (!line) return;
      team.feed.push({ line, t: data.t ?? 0 });
      if (team.feed.length > 6) team.feed.shift();
      if (hooks.onRadio) hooks.onRadio(line);
    },
    radioLine(line, t = 0) {
      team.feed.push({ line, t });
      if (team.feed.length > 6) team.feed.shift();
      if (hooks.onRadio) hooks.onRadio(line);
    },
    // Issue an IGL order (Z/X/C in P2): overrides the round plan.
    issueOrder(kind) {
      const plan = kind === 'LONG' ? 'LONG EXECUTE' : kind === 'SHORT' ? 'SHORT EXECUTE' : 'HOLD-SAVE';
      team.order = plan;
      team.plan = plan;
      team.applyPlan(plan);
      team.radio('order', { who: 'VEX', plan });
      if (hooks.onPlan) hooks.onPlan(plan, true);
    },
    applyPlan(plan) {
      const lanes = PLAYBOOK[plan]?.lanes ?? PLAYBOOK['LONG EXECUTE'].lanes;
      const delays = [0, 2, 0, 4];
      const order = ['VEX', 'ORIN', 'KITE', 'SABLE'];
      for (let i = 0; i < 4; i += 1) {
        const tm = byName[order[i]];
        if (!tm || !tm.alive) continue;
        const lane = lanes[i];
        if (lane === 'HOLD') {
          tm.setRoute([], {});
          tm.state = 'HOLD';
          tm.holdYaw = tm.yaw;
          continue;
        }
        const route = lane === 'LONG' ? ROUTES.LONG : lane === 'SHORT' ? ROUTES.SHORT : ROUTES.MID;
        tm.setRoute(route, team.waypoints);
        tm.waitUntil = team.now + delays[i];
        tm.state = 'HOLD';
      }
    },
    startRound(round, waypoints, now) {
      team.now = now;
      team.waypoints = waypoints;
      team.plan = team.order ?? planForRound(round);
      team.feed.length = 0;
      team.applyPlan(team.plan);
      if (hooks.onPlan) hooks.onPlan(team.plan, false);
    },
    // 2 Hz team decisions: staggered starts, trading, planting, bomb pickup.
    update(dt, ctx) {
      team.now = ctx.time;
      team.decisionTimer -= dt;
      for (const tm of bots) {
        if (tm.waitUntil && ctx.time >= tm.waitUntil && tm.state === 'HOLD' && tm.route.length) {
          tm.waitUntil = 0;
          tm.state = 'PATROL';
        }
      }
      if (team.decisionTimer > 0) return;
      team.decisionTimer = 0.5;
      // Trading: a teammate death pulls the nearest living teammate to the
      // killer's last known position for 5 s.
      if (ctx.lastDeath && ctx.time - ctx.lastDeath.t < 5) {
        const dead = ctx.lastDeath;
        let best = null;
        let bd = Infinity;
        for (const tm of bots) {
          if (!tm.alive || tm === dead.victim) continue;
          const d = Math.hypot(dead.x - tm.group.position.x, dead.z - tm.group.position.z);
          if (d < bd) { bd = d; best = tm; }
        }
        if (best && best.state !== 'ENGAGE') {
          best.huntPos = { x: dead.x, z: dead.z };
          best.state = 'HUNT';
        }
      }
      // Bomb handoff: the bomb is on the floor — ORIN first, else nearest.
      if (ctx.bombDropped && !team.carrier) {
        const orin = byName.ORIN;
        const carrier = orin?.alive ? orin : bots.filter((b) => b.alive).sort((a, b) => {
          const da = Math.hypot(ctx.bombX - a.group.position.x, ctx.bombZ - a.group.position.z);
          const db = Math.hypot(ctx.bombX - b.group.position.x, ctx.bombZ - b.group.position.z);
          return da - db;
        })[0];
        if (carrier) {
          carrier.huntPos = { x: ctx.bombX, z: ctx.bombZ };
          carrier.state = 'HUNT';
          carrier.pickupBomb = true;
        }
      }
      // ORIN plants when the site is clear of living enemies with LOS.
      if (ctx.bombCarrier === 'ORIN' && !ctx.bombPlanted) {
        const orin = byName.ORIN;
        if (orin?.alive && ctx.siteClear && orin.state !== 'ENGAGE') {
          if (hooks.onPlantRequest) hooks.onPlantRequest(orin);
        }
      }
    },
  };
  return team;
}

// Simulated teammate economy (§13.2): deterministic buy rule, same rewards.
export function teammateBuy(tm) {
  const m = tm.money;
  if (m >= 3350) {
    tm.loadout = { weapon: 'rifle', armor: 100, grenades: [] };
    tm.money -= 3350;
  } else if (m >= 1800) {
    tm.loadout = { weapon: 'smg', armor: 0, grenades: ['smoke', 'flash'] };
    tm.money -= 2000;
  } else if (m >= 1500) {
    tm.loadout = { weapon: 'smg', armor: 0, grenades: [] };
    tm.money -= 1500;
  } else {
    tm.loadout = { weapon: 'pistol', armor: 0, grenades: [] };
  }
  return tm.loadout;
}
