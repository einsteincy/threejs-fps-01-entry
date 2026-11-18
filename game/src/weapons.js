// Weapons (DESIGN.md §6 + §14.5): five hitscan weapons. Damage by body part,
// spread that punishes moving fire, bloom, recoil. The shotgun fires 8 pellets
// a pull with range falloff; the DMR is the premium long-range option with a
// near-zero first-shot spread and a stronger ADS. One tracer pool serves the
// player and the bots.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9', price: 500, mag: 12, reserve: 36, gap: 0.18,
    auto: false, torso: 26, head: 104, limbs: 20, reload: 1.4,
    recoilPitch: 0.008, recoilYaw: 0.003, bloom: 0.003,
  },
  smg: {
    id: 'smg', name: 'HORNET', price: 1500, mag: 25, reserve: 100, gap: 0.07,
    auto: true, torso: 22, head: 88, limbs: 17, reload: 1.6,
    recoilPitch: 0.007, recoilYaw: 0.004, bloom: 0.005,
  },
  rifle: {
    id: 'rifle', name: 'VK-7', price: 2700, mag: 30, reserve: 90, gap: 0.096,
    auto: true, torso: 34, head: 136, limbs: 26, reload: 1.9,
    recoilPitch: 0.011, recoilYaw: 0.004, bloom: 0.004,
  },
  shotgun: {
    id: 'shotgun', name: 'BREACHER', price: 1100, mag: 5, reserve: 20, gap: 0.9,
    auto: false, pellets: 8, torso: 14, head: 56, limbs: 11, reload: 2.8,
    recoilPitch: 0.03, recoilYaw: 0.01, bloom: 0.012, spreadBase: 0.09,
    falloffNear: 8, falloffFar: 15,
  },
  dmr: {
    id: 'dmr', name: 'LONGSHOT', price: 3000, mag: 10, reserve: 30, gap: 0.667,
    auto: false, torso: 55, head: 220, limbs: 42, reload: 3.0,
    recoilPitch: 0.02, recoilYaw: 0.002, bloom: 0.008, spreadBase: 0.001,
    moveMul: 0.85, adsFov: 44, adsSpread: 0.3,
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'shotgun', 'dmr'];

const SPREAD_BASE = 0.004;
const SPREAD_MOVE = 0.016;
const BLOOM_MAX = 0.03;
const BLOOM_DECAY = 0.06;
const MOVE_REF = 5.2;
const FLASH_TIME = 0.06;

// Fixed pool of tracer meshes: no allocation per shot (DESIGN.md §4).
export function createTracers(scene) {
  const pool = [];
  for (let i = 0; i < 12; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, life: 0 });
  }
  let next = 0;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const mid = new THREE.Vector3();
  return {
    spawn(a, b, color) {
      const slot = pool[next];
      next = (next + 1) % pool.length;
      from.copy(a);
      to.copy(b);
      const len = from.distanceTo(to);
      if (len < 0.1) return;
      mid.addVectors(from, to).multiplyScalar(0.5);
      slot.mesh.position.copy(mid);
      slot.mesh.scale.set(1, 1, len);
      slot.mesh.lookAt(to);
      slot.mesh.material.color.set(color ?? PALETTE.amber);
      slot.mesh.material.opacity = 0.9;
      slot.mesh.visible = true;
      slot.life = 0.06;
    },
    step(dt) {
      for (const slot of pool) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
    },
  };
}

const HIP_POSE = { x: 0.26, y: -0.22, z: -0.55 };
// ADS pulls the gun to the centre and raises it so the sight sits on the
// crosshair (receiver centre 0.05 below the sight line, sight post top at
// ~0). z stays -0.5 so the stock is ~0.31 m from the camera — at -0.42 it
// filled a third of the frame as a flat slab (round-2 finding).
const ADS_POSE = { x: 0.02, y: -0.05, z: -0.5 };

function buildViewModel(def) {
  // The viewmodel's back faces point away from every scene light, so the
  // gun rendered as a near-black slab in ADS. A low emissive lifts it to a
  // legible dark grey without touching the world lighting.
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), emissive: new THREE.Color(PALETTE.surface), emissiveIntensity: 0.5, roughness: 0.7, metalness: 0.05 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), emissive: new THREE.Color(PALETTE.ink), emissiveIntensity: 0.07, roughness: 0.5, metalness: 0.05 });
  const model = new THREE.Group();
  const long = def.id === 'dmr' ? 0.55 : def.id === 'shotgun' ? 0.5 : def.id === 'rifle' ? 0.42 : def.id === 'smg' ? 0.34 : 0.22;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, long), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, long * 0.9), grip);
  barrel.position.set(0, 0.025, -long * 0.9);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, long * 0.7);
  model.add(receiver, barrel, stock);
  if (def.id === 'dmr') {
    // DMR scope: a small tube on top of the receiver.
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), grip);
    scope.position.set(0, 0.09, -0.1);
    model.add(scope);
  }
  if (def.id === 'shotgun') {
    // Pump grip under the barrel.
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), grip);
    pump.position.set(0, -0.06, -long * 0.55);
    model.add(pump);
  }
  if (def.id !== 'dmr') {
    // Front sight post at the barrel tip: its top sits on the crosshair
    // when the gun is in the ADS pose (the DMR uses its scope instead).
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), body);
    post.position.set(0, 0.05, -long * 1.3);
    model.add(post);
  }
  model.scale.setScalar(0.65);
  model.position.set(HIP_POSE.x, HIP_POSE.y, HIP_POSE.z);
  return { model, muzzleZ: -0.55 - long * 0.9, long };
}

export function createArsenal(camera) {
  const state = {
    current: 'pistol',
    ammo: {},
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
  };
  for (const id of WEAPON_ORDER) {
    const def = WEAPONS[id];
    state.ammo[id] = { mag: def.mag, reserve: def.reserve, owned: id === 'pistol' };
  }
  const models = {};
  for (const id of WEAPON_ORDER) {
    const built = buildViewModel(WEAPONS[id]);
    built.model.visible = id === state.current;
    camera.add(built.model);
    models[id] = built;
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.2, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 5);
  flashLight.position.set(0.26, -0.18, -0.6);
  camera.add(flashLight);

  function def() {
    return WEAPONS[state.current];
  }

  // ADS pulls the viewmodel toward the centre of the screen (DESIGN.md §14.5:
  // the fight shot is staged ADS'd). snapAdsPose is the deterministic form
  // the ?shot= staging calls after its settle.
  function applyAdsPose(ads, snap) {
    const model = models[state.current].model;
    const pose = ads ? ADS_POSE : HIP_POSE;
    if (snap) {
      model.position.x = pose.x;
      model.position.y = pose.y;
    } else {
      const k = Math.min(1, 0.18);
      model.position.x += (pose.x - model.position.x) * k;
      model.position.y += (pose.y - model.position.y) * k;
    }
    model.position.z = pose.z + state.kick;
  }

  function step(dt, ads = false) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - BLOOM_DECAY * dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current].model;
    applyAdsPose(ads, false);
    model.rotation.x = state.kick * 2.2;
    // Muzzle flash + light ride the barrel tip (they were hard-coded to the
    // hip muzzle and stayed there while the gun moved to ADS).
    const tip = muzzleTip();
    flash.position.set(tip.x, tip.y, tip.z - 0.02);
    flashLight.position.set(tip.x, tip.y + 0.02, tip.z + 0.35);
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    const d = def();
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = state.ammo[state.current];
        const take = Math.min(d.mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  // Barrel tip in camera space (the tracer start and the flash anchor).
  // Barrel tip local z is -long*1.35, scaled 0.65 -> -long*0.8775; the
  // barrel sits 0.025 above the receiver centre, scaled -> +0.016.
  function muzzleTip() {
    const m = models[state.current];
    return new THREE.Vector3(m.model.position.x, m.model.position.y + 0.016, m.model.position.z - m.long * 0.8775);
  }

  return {
    state,
    def,
    step,
    muzzleTip,
    ready() {
      const slot = state.ammo[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    // Consumes one round and starts the fire cycle; main.js does the raycast.
    fire() {
      const slot = state.ammo[state.current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      const d = def();
      state.cooldown = d.gap;
      state.flash = FLASH_TIME;
      state.kick = 0.055;
      state.bloom = Math.min(BLOOM_MAX, state.bloom + d.bloom);
      return true;
    },
    reload() {
      const d = def();
      const slot = state.ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === d.mag || slot.reserve === 0) return;
      state.reloadLeft = d.reload;
    },
    switchTo(id) {
      if (!WEAPONS[id] || !state.ammo[id].owned || id === state.current) return false;
      models[state.current].model.visible = false;
      state.current = id;
      models[id].model.visible = true;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.1);
      return true;
    },
    buy(id) {
      if (!WEAPONS[id] || state.ammo[id].owned) return false;
      state.ammo[id].owned = true;
      return true;
    },
    refillAmmo(id) {
      const slot = state.ammo[id];
      if (!slot || !slot.owned) return false;
      slot.reserve = WEAPONS[id].reserve;
      return true;
    },
    spread(speed, crouched, airborne, adsMul = 1) {
      const base = def().spreadBase ?? SPREAD_BASE;
      let s = base + Math.min(1, speed / MOVE_REF) * SPREAD_MOVE;
      if (crouched) s *= 0.6;
      if (airborne) s *= 1.5;
      return (s + state.bloom) * adsMul;
    },
    // Range falloff multiplier for pellet weapons (1 inside falloffNear,
    // 0.5 at falloffNear, 0.25 at falloffFar and beyond).
    falloff(dist) {
      const d = def();
      if (!d.falloffNear) return 1;
      if (dist <= d.falloffNear) return 1 - (0.5 * dist) / d.falloffNear;
      if (dist >= d.falloffFar) return 0.25;
      return 0.5 - (0.25 * (dist - d.falloffNear)) / (d.falloffFar - d.falloffNear);
    },
    snapAdsPose(ads) {
      applyAdsPose(ads, true);
    },
    recoil() {
      const d = def();
      return { pitch: d.recoilPitch, yaw: d.recoilYaw };
    },
    dry() {
      const slot = state.ammo[state.current];
      return slot.mag === 0 && slot.reserve === 0;
    },
    reset() {
      for (const id of WEAPON_ORDER) {
        const d = WEAPONS[id];
        state.ammo[id] = { mag: d.mag, reserve: d.reserve, owned: id === 'pistol' };
      }
      state.current = 'pistol';
      for (const id of WEAPON_ORDER) models[id].model.visible = id === 'pistol';
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
