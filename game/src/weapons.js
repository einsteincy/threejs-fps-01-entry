// Weapons (DESIGN.md §6): three hitscan weapons for P1 (pistol / SMG / rifle;
// shotgun + DMR join in P2). Damage by body part, spread that punishes moving
// fire, bloom, recoil. One tracer pool serves the player and the bots.
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
};
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle'];

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

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.7, metalness: 0.05 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.05 });
  const model = new THREE.Group();
  const long = def.id === 'rifle' ? 0.42 : def.id === 'smg' ? 0.34 : 0.22;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, long), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, long * 0.9), grip);
  barrel.position.set(0, 0.025, -long * 0.9);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, long * 0.7);
  model.add(receiver, barrel, stock);
  model.scale.setScalar(0.65);
  model.position.set(0.26, -0.22, -0.55);
  return { model, muzzleZ: -0.55 - long * 0.9 };
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

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - BLOOM_DECAY * dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current].model;
    model.position.z = -0.55 + state.kick;
    model.rotation.x = state.kick * 2.2;
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

  return {
    state,
    def,
    step,
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
      let s = SPREAD_BASE + Math.min(1, speed / MOVE_REF) * SPREAD_MOVE;
      if (crouched) s *= 0.6;
      if (airborne) s *= 1.5;
      return (s + state.bloom) * adsMul;
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
