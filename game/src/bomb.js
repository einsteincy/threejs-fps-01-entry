// Bomb (DESIGN.md §8 + §13.1): the player carries it by default; hold E 4 s
// inside the site to plant; the 40 s fuse then counts down (the round timer
// stops); the nearest enemy defuses on a 5 s channel. A dead carrier drops
// the bomb on the floor for a teammate to pick up (0.5 s channel).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITE } from './map.js';

export const PLANT_TIME = 4;
export const FUSE_TIME = 40;
export const DEFUSE_TIME = 5;
export const PICKUP_TIME = 0.5;

export function createBomb(scene) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.2, 0.42),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.5, metalness: 0.3 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  const beepLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  scene.add(beepLight);

  const bomb = {
    carrier: 'player',
    dropped: null,
    planted: false,
    plantProgress: 0,
    fuse: 0,
    beepTimer: 0,
    pickupProgress: 0,
    mesh,
    inSite(x, z) {
      return x >= SITE.x0 && x <= SITE.x1 && z >= SITE.z0 && z <= SITE.z1;
    },
    drop(x, z) {
      bomb.carrier = null;
      bomb.dropped = { x, z };
      bomb.plantProgress = 0;
      mesh.visible = true;
      mesh.position.set(x, 0.12, z);
    },
    pickup(who) {
      bomb.carrier = who;
      bomb.dropped = null;
      bomb.pickupProgress = 0;
      mesh.visible = false;
    },
    plant() {
      bomb.planted = true;
      bomb.fuse = FUSE_TIME;
      bomb.beepTimer = 0;
      mesh.visible = true;
      mesh.position.set(16, 0.12, -11);
    },
    reset() {
      bomb.carrier = 'player';
      bomb.dropped = null;
      bomb.planted = false;
      bomb.plantProgress = 0;
      bomb.fuse = 0;
      bomb.beepTimer = 0;
      bomb.pickupProgress = 0;
      mesh.visible = false;
      beepLight.intensity = 0;
    },
    // Fuse countdown; returns 'detonate' when the fuse runs out. Beeps once
    // a second (radius 20 noise — main.js reads bomb.beeped).
    step(dt, onBeep) {
      bomb.beeped = false;
      if (!bomb.planted) return null;
      bomb.fuse -= dt;
      bomb.beepTimer -= dt;
      if (bomb.beepTimer <= 0) {
        bomb.beepTimer = 1;
        bomb.beeped = true;
        beepLight.intensity = 8;
        if (onBeep) onBeep(mesh.position.x, mesh.position.z, 20);
      } else {
        beepLight.intensity = Math.max(0, beepLight.intensity - dt * 30);
      }
      beepLight.position.copy(mesh.position).y = 1;
      if (bomb.fuse <= 0) return 'detonate';
      return null;
    },
  };
  return bomb;
}
