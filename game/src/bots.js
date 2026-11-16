// Bots (DESIGN.md §7 + §13.2/§13.3): ONE shared Bot class for teammates and
// enemies (side + role). States: PATROL / HOLD / HUNT / ENGAGE / DEFUSE /
// RETAKE / ROTATE / DEAD. Sight is a 10 Hz staggered LOS raycast; hearing is
// the shared noise list. Bot shots are hitscan raycasts (main.js resolves
// them); this file owns movement, senses, bursts and the coordination states.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const EYE = 1.55;
const RADIUS = 0.34;
const HEIGHT = 1.72;
const PATROL_SPEED = 3.6;
const HUNT_SPEED = 4.4;
const STRAFE_SPEED = 2.2;
const LOS_RANGE = 45;
const LOS_HZ = 0.1;
const REACT_BASE = 0.45;
const BURST_GAP = 0.12;
const BURST_PAUSE = 0.9;
const SPREAD_BASE = 0.03;
const SPREAD_PER_M = 0.0015;
const BOT_TORSO_DMG = 12;
const BOT_HEAD_DMG = 34;

const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _probe = new THREE.Box3();

// Segment vs sphere: true when the segment from->to passes through a smoke ball.
function segmentHitsSphere(from, to, cx, cy, cz, r) {
  _seg.subVectors(to, from);
  const lenSq = _seg.lengthSq();
  if (lenSq === 0) return false;
  const t = Math.max(0, Math.min(1, ((cx - from.x) * _seg.x + (cy - from.y) * _seg.y + (cz - from.z) * _seg.z) / lenSq));
  const px = from.x + _seg.x * t;
  const py = from.y + _seg.y * t;
  const pz = from.z + _seg.z * t;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return dx * dx + dy * dy + dz * dz < r * r;
}

export function createBot(scene, opts) {
  const { id, callsign, side, role, spawn, seed } = opts;
  const isEnemy = side === 'bots';
  const group = new THREE.Group();
  group.position.set(spawn[0], 0, spawn[1]);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(isEnemy ? PALETTE.rust : PALETTE.teal),
    roughness: 0.6, metalness: 0.05,
  });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
  const bandMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), bodyMat);
  torso.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), headMat);
  head.position.y = 1.53;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.34), bandMat);
  band.position.y = 1.56;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.6), darkMat);
  gun.position.set(0.2, 1.15, -0.3);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.28), darkMat);
  legs.position.y = 0.32;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), darkMat);
  base.position.y = 0.04;
  group.add(base, legs, torso, head, band, gun);
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  scene.add(group);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.2, 1.15, -0.75);
  flash.visible = false;
  group.add(flash);

  const bot = {
    id,
    callsign,
    side,
    role,
    group,
    torso,
    head,
    legs,
    hp: 100,
    alive: true,
    state: 'PATROL',
    yaw: 0,
    route: [],
    routeIndex: 0,
    dest: null,
    destName: null,
    holdYaw: 0,
    scanT: 0,
    losTimer: Math.random() * LOS_HZ,
    losOk: false,
    target: null,
    reaction: 0,
    jitter: (seed % 100) / 100 * 0.3 - 0.15,
    burstLeft: 0,
    burstTimer: 0,
    burstPause: 0,
    strafeDir: 1,
    strafeTimer: 0,
    huntPos: null,
    lookTimer: 0,
    stuckTimer: 0,
    stuckPos: new THREE.Vector3(spawn[0], 0, spawn[1]),
    fall: 0,
    flashTimer: 0,
    hitFlash: 0,
    defuseProgress: 0,
    retakeGate: null,
    retakeReady: false,
    rotateTarget: null,
    crouched: false,
    kills: 0,
    deaths: 0,
    lastKnown: null,
    losLostTimer: 0,
    home: new THREE.Vector3(spawn[0], 0, spawn[1]),
  };
  torso.userData = { bot, part: 'torso' };
  head.userData = { bot, part: 'head' };
  legs.userData = { bot, part: 'limbs' };
  bot.hitMeshes = [torso, head, legs];

  function setRoute(names, waypoints, loop = false) {
    bot.route = names.map((n) => waypoints[n]).filter(Boolean);
    bot.routeIndex = 0;
    bot.loop = loop;
    bot.dest = bot.route.length ? { x: bot.route[0][0], z: bot.route[0][1] } : null;
    bot.destName = names[0] ?? null;
  }

  function moveToward(dt, tx, tz, speed, colliders) {
    const dx = tx - group.position.x;
    const dz = tz - group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    bot.yaw = Math.atan2(-dx, -dz);
    const nx = group.position.x + vx * dt;
    _probe.min.set(nx - RADIUS, 0.04, group.position.z - RADIUS);
    _probe.max.set(nx + RADIUS, HEIGHT - 0.04, group.position.z + RADIUS);
    let blocked = false;
    for (const c of colliders) if (_probe.intersectsBox(c)) { blocked = true; break; }
    if (!blocked) group.position.x = nx;
    const nz = group.position.z + vz * dt;
    _probe.min.set(group.position.x - RADIUS, 0.04, nz - RADIUS);
    _probe.max.set(group.position.x + RADIUS, HEIGHT - 0.04, nz + RADIUS);
    blocked = false;
    for (const c of colliders) if (_probe.intersectsBox(c)) { blocked = true; break; }
    if (!blocked) group.position.z = nz;
    return Math.hypot(tx - group.position.x, tz - group.position.z) < 0.6;
  }

  function hasLos(targetPos, shootables, smokes) {
    _from.set(group.position.x, EYE, group.position.z);
    _to.set(targetPos.x, 1.2, targetPos.z);
    const dist = _from.distanceTo(_to);
    if (dist > LOS_RANGE) return false;
    _dir.subVectors(_to, _from).normalize();
    _ray.set(_from, _dir);
    _ray.far = dist;
    const hit = _ray.intersectObjects(shootables, false)[0];
    if (hit) return false;
    for (const s of smokes) {
      if (segmentHitsSphere(_from, _to, s.x, 1.2, s.z, s.r)) return false;
    }
    return true;
  }

  function nearestFoe(foes, shootables, smokes) {
    let best = null;
    let bestDist = Infinity;
    for (const foe of foes) {
      if (!foe.alive) continue;
      const d = Math.hypot(foe.pos.x - group.position.x, foe.pos.z - group.position.z);
      if (d < bestDist && hasLos(foe.pos, shootables, smokes)) {
        best = foe;
        bestDist = d;
      }
    }
    return best;
  }

  function damage(amount, part) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    bot.hitFlash = 0.1;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.state = 'DEAD';
      bot.fall = 0;
      bot.deaths += 1;
      return true;
    }
    return false;
  }

  function step(dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      group.rotation.x = -bot.fall * 1.45;
      group.position.y = -bot.fall * 0.08;
      return;
    }
    if (bot.flashTimer > 0) {
      bot.flashTimer -= dt;
      flash.visible = bot.flashTimer > 0;
    }
    if (bot.hitFlash > 0) {
      bot.hitFlash -= dt;
      const on = bot.hitFlash > 0;
      torso.material.emissive.setHex(on ? 0x992200 : 0x000000);
      head.material.emissive.setHex(on ? 0x992200 : 0x000000);
    }
    // Stuck detection: no progress for 1.5 s -> step to a nearby waypoint.
    bot.stuckTimer += dt;
    if (group.position.distanceTo(bot.stuckPos) > 0.5) {
      bot.stuckPos.copy(group.position);
      bot.stuckTimer = 0;
    } else if (bot.stuckTimer > 1.5 && bot.dest && ctx.waypoints) {
      const names = Object.keys(ctx.waypoints);
      const pick = ctx.waypoints[names[Math.floor(Math.random() * names.length)]];
      bot.dest = { x: pick[0] + (Math.random() * 2 - 1), z: pick[1] + (Math.random() * 2 - 1) };
      bot.stuckTimer = 0;
    }

    // Senses at 10 Hz, staggered per bot.
    bot.losTimer -= dt;
    if (bot.losTimer <= 0) {
      bot.losTimer += LOS_HZ;
      const foe = nearestFoe(ctx.foes, ctx.shootables, ctx.smokes);
      if (foe) {
        const newly = !bot.target;
        if (newly) bot.reaction = REACT_BASE + bot.jitter;
        bot.target = foe;
        bot.losOk = true;
        bot.losLostTimer = 0;
        bot.lastKnown = { x: foe.pos.x, z: foe.pos.z };
        if (newly && ctx.onSpot) ctx.onSpot(bot, foe);
      } else {
        bot.losOk = false;
        if (bot.target) {
          bot.losLostTimer += LOS_HZ;
          if (bot.losLostTimer > 0.5) bot.target = null;
        }
      }
    }
    // Hearing: any noise in radius pulls the bot to HUNT (gunfire pulls all
    // in radius; steps pull the nearest only — main.js pre-filters steps).
    if (ctx.noise && bot.state !== 'ENGAGE' && bot.state !== 'DEFUSE' && bot.state !== 'RETAKE') {
      for (const n of ctx.noise) {
        const d = Math.hypot(n.x - group.position.x, n.z - group.position.z);
        if (d < n.radius * ctx.noiseMask) {
          bot.huntPos = { x: n.x + (bot.id * 1.7 % 2) - 1, z: n.z + (bot.id * 1.3 % 2) - 1 };
          if (bot.state !== 'HUNT') bot.state = 'HUNT';
          break;
        }
      }
    }

    const crouchHold = bot.state === 'HOLD';
    if (crouchHold !== bot.crouched) {
      bot.crouched = crouchHold;
      torso.position.y = crouchHold ? 0.72 : 1.0;
      head.position.y = crouchHold ? 1.12 : 1.53;
      band.position.y = crouchHold ? 1.15 : 1.56;
      gun.position.y = crouchHold ? 0.85 : 1.15;
      flash.position.y = crouchHold ? 0.85 : 1.15;
    }

    switch (bot.state) {
      case 'PATROL': {
        if (bot.target) {
          bot.state = 'ENGAGE';
          break;
        }
        if (bot.dest) {
          const arrived = moveToward(dt, bot.dest.x, bot.dest.z, PATROL_SPEED, ctx.colliders);
          if (arrived) {
            bot.routeIndex += 1;
            if (bot.routeIndex >= bot.route.length) {
              if (bot.loop) {
                bot.routeIndex = 0;
                bot.dest = { x: bot.route[0][0], z: bot.route[0][1] };
              } else {
                bot.state = 'HOLD';
                bot.holdYaw = bot.yaw;
              }
            } else {
              bot.dest = { x: bot.route[bot.routeIndex][0], z: bot.route[bot.routeIndex][1] };
              bot.destName = null;
            }
          }
        } else {
          bot.state = 'HOLD';
          bot.holdYaw = bot.yaw;
        }
        break;
      }
      case 'HOLD': {
        bot.scanT += dt;
        bot.yaw = bot.holdYaw + Math.sin(bot.scanT * 0.7) * 0.7;
        if (bot.target) bot.state = 'ENGAGE';
        // Low HP: fall back to the nearest cover node and hold there.
        if (bot.hp < 30 && ctx.coverNodes) {
          let best = null;
          let bd = Infinity;
          for (const n of ctx.coverNodes) {
            const d = Math.hypot(n[0] - group.position.x, n[1] - group.position.z);
            if (d < bd) { bd = d; best = n; }
          }
          if (best) {
            bot.dest = { x: best[0], z: best[1] };
            bot.state = 'PATROL';
          }
        }
        break;
      }
      case 'HUNT': {
        if (bot.target) {
          bot.state = 'ENGAGE';
          break;
        }
        if (bot.huntPos) {
          const arrived = moveToward(dt, bot.huntPos.x, bot.huntPos.z, HUNT_SPEED, ctx.colliders);
          if (arrived) {
            bot.lookTimer += dt;
            bot.yaw += dt * 1.5;
            if (bot.lookTimer > 3) {
              bot.lookTimer = 0;
              bot.huntPos = null;
              bot.state = bot.route.length ? 'PATROL' : 'HOLD';
            }
          }
        } else {
          bot.state = bot.route.length ? 'PATROL' : 'HOLD';
        }
        break;
      }
      case 'ENGAGE': {
        if (!bot.target || !bot.target.alive) {
          bot.target = null;
          bot.state = bot.huntPos ? 'HUNT' : bot.route.length ? 'PATROL' : 'HOLD';
          break;
        }
        const tp = bot.target.pos;
        const dx = tp.x - group.position.x;
        const dz = tp.z - group.position.z;
        const dist = Math.hypot(dx, dz);
        bot.yaw = Math.atan2(-dx, -dz);
        // Strafe sideways 30% of the time so the bot is not a still target.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 1.4;
          bot.strafeDir = Math.random() < 0.3 ? -bot.strafeDir : bot.strafeDir;
        }
        if (dist > 14) {
          moveToward(dt, tp.x, tp.z, PATROL_SPEED, ctx.colliders);
        } else if (dist < 4) {
          moveToward(dt, group.position.x - dx, group.position.z - dz, PATROL_SPEED, ctx.colliders);
        } else {
          const px = -dz / dist * bot.strafeDir;
          const pz = dx / dist * bot.strafeDir;
          moveToward(dt, group.position.x + px * 2, group.position.z + pz * 2, STRAFE_SPEED, ctx.colliders);
        }
        if (bot.reaction > 0) {
          bot.reaction -= dt;
          break;
        }
        if (bot.burstPause > 0) {
          bot.burstPause -= dt;
          break;
        }
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + Math.floor(Math.random() * 3);
          bot.burstTimer = 0;
        }
        bot.burstTimer -= dt;
        if (bot.burstTimer <= 0) {
          bot.burstTimer = BURST_GAP;
          bot.burstLeft -= 1;
          if (bot.burstLeft <= 0) bot.burstPause = BURST_PAUSE;
          const spread = (isEnemy ? SPREAD_BASE : 0.035) + SPREAD_PER_M * Math.max(0, dist - 10);
          const targetSpeed = bot.target.speed ?? 0;
          const finalSpread = targetSpeed > 4.5 ? spread * 1.5 : spread;
          ctx.onShoot(bot, tp, finalSpread);
          bot.flashTimer = 0.06;
          flash.visible = true;
        }
        break;
      }
      case 'DEFUSE': {
        const site = ctx.site;
        const d = Math.hypot(site.cx - group.position.x, site.cz - group.position.z);
        if (d > 1.2) {
          moveToward(dt, site.cx, site.cz, HUNT_SPEED, ctx.colliders);
        } else {
          bot.defuseProgress += dt / 5;
          if (ctx.onDefuseProgress) ctx.onDefuseProgress(bot.defuseProgress);
          if (bot.defuseProgress >= 1) ctx.onDefused(bot);
        }
        break;
      }
      case 'RETAKE': {
        if (bot.target) {
          bot.state = 'ENGAGE';
          break;
        }
        if (bot.retakeGate) {
          const arrived = moveToward(dt, bot.retakeGate.x, bot.retakeGate.z, HUNT_SPEED, ctx.colliders);
          if (arrived) bot.retakeReady = true;
        }
        if (bot.retakeReady && ctx.retakeGo) {
          const site = ctx.site;
          moveToward(dt, site.cx, site.cz, HUNT_SPEED, ctx.colliders);
        }
        break;
      }
      case 'ROTATE': {
        if (bot.target) {
          bot.state = 'ENGAGE';
          break;
        }
        if (bot.rotateTarget) {
          const arrived = moveToward(dt, bot.rotateTarget.x, bot.rotateTarget.z, HUNT_SPEED, ctx.colliders);
          if (arrived) {
            bot.state = 'HOLD';
            bot.holdYaw = bot.yaw;
          }
        } else {
          bot.state = 'HOLD';
        }
        break;
      }
      default:
        break;
    }
    group.rotation.y = bot.yaw;
  }

  // Attach the methods to the one bot object (no spread-copy: the methods
  // close over this same object, so hp/alive/state stay in sync everywhere).
  bot.setRoute = setRoute;
  bot.damage = damage;
  bot.step = step;
  bot.reset = function reset(x, z, yaw = 0) {
      group.position.set(x, 0, z);
      group.rotation.set(0, yaw, 0);
      bot.yaw = yaw;
      bot.hp = 100;
      bot.alive = true;
      bot.state = 'PATROL';
      bot.route = [];
      bot.routeIndex = 0;
      bot.dest = null;
      bot.target = null;
      bot.losOk = false;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.reaction = 0;
      bot.huntPos = null;
      bot.lookTimer = 0;
      bot.fall = 0;
      bot.flashTimer = 0;
      bot.hitFlash = 0;
      bot.defuseProgress = 0;
      bot.retakeGate = null;
      bot.retakeReady = false;
      bot.rotateTarget = null;
      bot.kills = 0;
      bot.deaths = 0;
      bot.lastKnown = null;
      bot.losLostTimer = 0;
      torso.material.emissive.setHex(0x000000);
      head.material.emissive.setHex(0x000000);
  };
  return bot;
}

export const BOT_DAMAGE = { torso: BOT_TORSO_DMG, head: BOT_HEAD_DMG };

// Enemy-team coordination (§13.3): shared knowledge + RETAKE + ROTATE.
// Runs at 1 Hz from main.js; assigns states, never moves bots itself.
export function createEnemyTeam(enemies) {
  const team = {
    known: [],
    retakeGo: false,
    note(lane, x, z, t) {
      team.known.push({ lane, x, z, t });
      if (team.known.length > 8) team.known.shift();
    },
    update(dt, ctx) {
      const alive = enemies.filter((e) => e.alive);
      if (!alive.length) return;
      if (ctx.bombPlanted) {
        // Nearest alive enemy defuses; the other four retake together.
        let defuser = null;
        let bd = Infinity;
        for (const e of alive) {
          const d = Math.hypot(ctx.site.cx - e.group.position.x, ctx.site.cz - e.group.position.z);
          if (d < bd) { bd = d; defuser = e; }
        }
        for (const e of alive) {
          if (e === defuser) {
            if (e.state !== 'DEFUSE' && e.state !== 'ENGAGE') {
              e.state = 'DEFUSE';
              e.defuseProgress = 0;
            }
          } else if (e.state !== 'ENGAGE' && e.state !== 'RETAKE') {
            e.state = 'RETAKE';
            const gate = e.id % 2 === 0
              ? { x: 12, z: -12 }
              : { x: 12, z: -6 };
            e.retakeGate = gate;
            e.retakeReady = false;
          }
        }
        const retakers = alive.filter((e) => e !== defuser && e.state === 'RETAKE');
        const ready = retakers.filter((e) => e.retakeReady).length;
        team.retakeGo = ready >= 2 || retakers.length === 0;
        return;
      }
      team.retakeGo = false;
      // ROTATE: 2+ contacts (or a kill) on a lane pulls the mid holder and
      // the far-lane patroller to the threatened side, staggered.
      const recent = team.known.filter((k) => ctx.time - k.t < 6);
      const byLane = {};
      for (const k of recent) byLane[k.lane] = (byLane[k.lane] || 0) + 1;
      let hot = null;
      for (const lane of Object.keys(byLane)) {
        if (byLane[lane] >= 2) hot = lane;
      }
      if (hot && ctx.onRotate) ctx.onRotate(hot);
    },
  };
  return team;
}

// Pairwise separation: bots repel within 1.2 m (DESIGN.md §7 anti-clustering).
export function separateBots(bots) {
  for (let i = 0; i < bots.length; i += 1) {
    const a = bots[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < bots.length; j += 1) {
      const b = bots[j];
      if (!b.alive) continue;
      const dx = b.group.position.x - a.group.position.x;
      const dz = b.group.position.z - a.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 1.2) {
        const push = (1.2 - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.group.position.x -= nx * push;
        a.group.position.z -= nz * push;
        b.group.position.x += nx * push;
        b.group.position.z += nz * push;
      }
    }
  }
}
